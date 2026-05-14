<?php

declare( strict_types=1 );

error_reporting( E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_RECOVERABLE_ERROR | E_WARNING );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '1' );

// PHP/WASM running via php.run({scriptPath}) does not pre-define the STD*
// streams. Define them so error reporting works under both CLI and wasm.
if ( !defined( 'STDIN' ) ) { define( 'STDIN', fopen( 'php://stdin', 'rb' ) ); }
if ( !defined( 'STDOUT' ) ) { define( 'STDOUT', fopen( 'php://stdout', 'wb' ) ); }
if ( !defined( 'STDERR' ) ) { define( 'STDERR', fopen( 'php://stderr', 'wb' ) ); }

// Suppress PHP/WASM destructor sequence crashes (zend_std_write_property
// "unreachable" trap) by clearing Scribunto's static state and exiting the
// script before the destructor chain reaches whatever object PHP/WASM cannot
// finalize cleanly. The on-disk response file is what the TypeScript backend
// actually reads, so it's fine for PHP to bail at shutdown time.
register_shutdown_function( static function (): void {
	// Force Scribunto LuaStandalone state to a known empty state.
	$cls = 'MediaWiki\\Extension\\Scribunto\\Engines\\LuaStandalone\\LuaStandaloneInterpreterFunction';
	if ( class_exists( $cls, false ) ) {
		$cls::$activeChunkIds = [];
		$cls::$anyChunksDestroyed = [];
	}
} );

$requestPath = $argv[1] ?? getenv( 'JA_UCP_REQUEST_PATH' ) ?: '';
$localSettingsPath = $argv[2] ?? getenv( 'JA_UCP_LOCAL_SETTINGS' ) ?: '';
$IP = $argv[3] ?? getenv( 'JA_UCP_MW_ROOT' ) ?: '';

if ( $requestPath === '' || $localSettingsPath === '' || $IP === '' ) {
	fwrite( STDERR, "Usage: php ja-ucp-render.php request.json LocalSettings.php mediawiki-root\n" );
	fwrite( STDERR, "or set JA_UCP_REQUEST_PATH, JA_UCP_LOCAL_SETTINGS, JA_UCP_MW_ROOT.\n" );
	exit( 2 );
}

try {
	$request = json_decode( file_get_contents( $requestPath ), true, 512, JSON_THROW_ON_ERROR );
} catch ( Throwable $e ) {
	fwrite( STDERR, "Invalid request JSON: " . $e->getMessage() . "\n" );
	exit( 2 );
}

$urlParameters = isset( $request['urlParameters'] ) && is_array( $request['urlParameters'] )
	? array_map( 'strval', $request['urlParameters'] )
	: [];

$_GET = $urlParameters;
$_POST = [];
$_REQUEST = $urlParameters;
$_COOKIE = [];
$_SERVER['REMOTE_ADDR'] = $request['user']['ip'] ?? '127.0.0.1';
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SERVER_NAME'] = 'ansaikuropedia.org';
$_SERVER['SERVER_PORT'] = '443';
$_SERVER['HTTPS'] = 'on';
$_SERVER['REQUEST_URI'] = '/wiki/' . rawurlencode( str_replace( ' ', '_', (string)$request['title'] ) );

define( 'MW_CONFIG_FILE', $localSettingsPath );
require_once $IP . '/includes/WebStart.php';

use MediaWiki\MediaWikiServices;
use MediaWiki\Revision\SlotRecord;

try {
	$services = MediaWikiServices::getInstance();
	$title = Title::newFromText( (string)$request['title'] );
	if ( !$title ) {
		throw new RuntimeException( 'Invalid title: ' . (string)$request['title'] );
	}

	$context = RequestContext::getMain();
	$context->setTitle( $title );
	$context->setRequest( new FauxRequest( $urlParameters, false ) );
	$user = buildPreviewUser( $request['user'] ?? [] );
	$context->setUser( $user );

	seedPages( $request, $user );

	$options = ParserOptions::newFromUser( $user );
	$options->setIsPreview( true );
	if ( isset( $request['now'] ) ) {
		$options->setTimestamp( wfTimestamp( TS_MW, $request['now'] ) );
	}

	$content = ContentHandler::makeContent( (string)$request['wikitext'], $title, CONTENT_MODEL_WIKITEXT );
	$pstContent = $services->getContentTransformer()->preSaveTransform( $content, $title, $user, $options );
	$output = $services->getContentRenderer()->getParserOutput( $pstContent, $title, null, $options );

	$result = [
		'html' => $output->getText(),
		'css' => buildCssBundle( $request, $output ),
		'categories' => array_values( $output->getCategoryNames() ),
		'links' => flattenTitleMap( $output->getLinks() ),
		'templates' => flattenTitleMap( $output->getTemplates() ),
		'defaultSort' => $output->getPageProperty( 'defaultsort' ) ?? null,
		'diagnostics' => collectDiagnostics( $output ),
		'metadata' => [
			'title' => $title->getPrefixedText(),
			'displayTitle' => $output->getDisplayTitle() ?: null,
			'generator' => 'MediaWiki 1.39.3',
			'backend' => getenv( 'JA_UCP_BACKEND_NAME' ) ?: 'mediawiki-php-wasm'
		]
	];

	$encoded = json_encode( $result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR );

	// Write the response to a file (read by the TypeScript backend) AND
	// echo to stdout. The file is the authoritative response: PHP/WASM can
	// trap during shutdown destructors after this point, but the rendered
	// JSON has already been persisted to disk.
	$responseFile = $requestPath . '.response';
	file_put_contents( $responseFile, $encoded );

	echo $encoded, "\n";

	// Eagerly clean up Scribunto's interpreter object while we're still in
	// user code, BEFORE PHP enters its shutdown destructor sequence. The
	// PHP/WASM runtime currently traps "unreachable" inside one of the
	// destructors when Scribunto's static chunk state is mutated from the
	// destructor chain; doing the cleanup ourselves bypasses that path.
	try {
		$scribuntoEngineByParserClass = 'MediaWiki\\Extension\\Scribunto\\Hooks';
		if ( class_exists( $scribuntoEngineByParserClass, false ) ) {
			$prop = ( new ReflectionClass( $scribuntoEngineByParserClass ) )->getProperty( 'engineByParser' );
			if ( $prop ) {
				$prop->setAccessible( true );
				$map = $prop->getValue() ?? [];
				foreach ( $map as $engine ) {
					if ( $engine !== null && method_exists( $engine, 'destroy' ) ) {
						$engine->destroy();
					}
				}
				$prop->setValue( null, [] );
			}
		}
	} catch ( Throwable $cleanupErr ) {
		fwrite( STDERR, "(scribunto cleanup ignored: " . $cleanupErr->getMessage() . ")\n" );
	}
	// Force Scribunto's static reference store to a known-empty state so the
	// destructor chain doesn't recurse into a wasm-unsafe code path.
	$staticCls = 'MediaWiki\\Extension\\Scribunto\\Engines\\LuaStandalone\\LuaStandaloneInterpreterFunction';
	if ( class_exists( $staticCls, false ) ) {
		$staticCls::$activeChunkIds = [];
		$staticCls::$anyChunksDestroyed = [];
	}
} catch ( Throwable $e ) {
	fwrite( STDERR, get_class( $e ) . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n" );
	exit( 1 );
}

/**
 * @param array<string,mixed> $userData
 */
function buildPreviewUser( array $userData ): User {
	if ( $userData['anonymous'] ?? false ) {
		return new User();
	}

	$username = isset( $userData['username'] ) && $userData['username'] !== ''
		? (string)$userData['username']
		: 'JaUcpPreview';
	$user = User::newFromName( $username, false ) ?: new User();
	if ( $user->isRegistered() && !$user->getId() ) {
		$user->addToDatabase();
	}
	if ( isset( $userData['realName'] ) ) {
		$user->setRealName( (string)$userData['realName'] );
	}
	if ( isset( $userData['email'] ) ) {
		$user->setEmail( (string)$userData['email'] );
	}
	if ( isset( $userData['groups'] ) && is_array( $userData['groups'] ) && $user->getId() ) {
		$groupManager = MediaWikiServices::getInstance()->getUserGroupManager();
		foreach ( $userData['groups'] as $group ) {
			$groupManager->addUserToGroup( $user, (string)$group );
		}
	}

	return $user;
}

/**
 * @param array<string,mixed> $request
 */
function seedPages( array $request, User $user ): void {
	$pages = [];
	if ( isset( $request['templateOverrides'] ) && is_array( $request['templateOverrides'] ) ) {
		foreach ( $request['templateOverrides'] as $name => $text ) {
			$title = strpos( (string)$name, ':' ) === false ? 'Template:' . $name : (string)$name;
			$pages[$title] = [ 'text' => (string)$text ];
		}
	}
	if ( isset( $request['pageOverrides'] ) && is_array( $request['pageOverrides'] ) ) {
		foreach ( $request['pageOverrides'] as $title => $override ) {
			$pages[(string)$title] = is_array( $override ) ? $override : [ 'text' => (string)$override ];
		}
	}

	foreach ( $pages as $titleText => $override ) {
		$title = Title::newFromText( (string)$titleText );
		if ( !$title ) {
			throw new RuntimeException( 'Invalid override title: ' . (string)$titleText );
		}
		$text = isset( $override['text'] ) ? (string)$override['text'] : '';
		$model = isset( $override['contentModel'] )
			? (string)$override['contentModel']
			: inferContentModel( $title );
		$content = ContentHandler::makeContent( $text, $title, $model );
		$page = WikiPage::factory( $title );
		$existing = $page->getContent();
		if (
			$existing &&
			$existing->getModel() === $model &&
			method_exists( $existing, 'getText' ) &&
			$existing->getText() === $text
		) {
			continue;
		}
		$updater = $page->newPageUpdater( $user );
		$updater->setContent( SlotRecord::MAIN, $content );
		$updater->saveRevision( CommentStoreComment::newUnsavedComment( 'ja-ucp-preview seed' ), EDIT_INTERNAL );
	}
}

function inferContentModel( Title $title ): string {
	if ( $title->getNamespace() === 828 && !preg_match( '#/(doc|testcases)$#i', $title->getDBkey() ) ) {
		return CONTENT_MODEL_SCRIBUNTO;
	}
	if ( preg_match( '/\\.css$/i', $title->getDBkey() ) ) {
		return 'sanitized-css';
	}
	return CONTENT_MODEL_WIKITEXT;
}

/**
 * @param array<int,array<string,int|string|null>> $map
 * @return string[]
 */
function flattenTitleMap( array $map ): array {
	$titles = [];
	foreach ( $map as $namespace => $values ) {
		foreach ( $values as $dbKey => $_id ) {
			$title = Title::makeTitleSafe( (int)$namespace, (string)$dbKey );
			$titles[] = $title ? $title->getPrefixedText() : (string)$dbKey;
		}
	}
	sort( $titles, SORT_STRING );
	return $titles;
}

/**
 * @param array<string,mixed> $request
 */
function buildCssBundle( array $request, ParserOutput $output ): string {
	$chunks = [];
	if ( isset( $request['siteStyleTitles'] ) && is_array( $request['siteStyleTitles'] ) ) {
		foreach ( $request['siteStyleTitles'] as $titleText ) {
			$css = cssTextForTitle( (string)$titleText );
			if ( $css !== null && $css !== '' ) {
				$chunks[] = Html::inlineStyle( $css, 'all', [
					'data-ja-ucp-source' => (string)$titleText
				] );
			}
		}
	}

	$headItems = implode( "\n", $output->getHeadItems() );
	if ( $headItems !== '' ) {
		$chunks[] = inlineLocalStylesheetLinks( $headItems );
	}

	return implode( "\n", array_values( array_filter(
		$chunks,
		static function ( string $chunk ): bool {
			return $chunk !== '';
		}
	) ) );
}

function inlineLocalStylesheetLinks( string $html ): string {
	return preg_replace_callback(
		'/<link\b(?=[^>]*\brel\s*=\s*([\'"])stylesheet\1)[^>]*>/i',
		static function ( array $matches ): string {
			$tag = $matches[0];
			$href = htmlAttributeValue( $tag, 'href' );
			if ( $href === null ) {
				return $tag;
			}
			$css = cssTextForStylesheetHref( $href );
			if ( $css === null ) {
				return $tag;
			}
			return Html::inlineStyle( $css, 'all', [
				'data-ja-ucp-source' => stylesheetSourceName( $href ) ?? $href
			] );
		},
		$html
	);
}

function htmlAttributeValue( string $tag, string $name ): ?string {
	$quotedPattern = '/\s' . preg_quote( $name, '/' ) . '\s*=\s*([\'"])(.*?)\1/i';
	if ( preg_match( $quotedPattern, $tag, $matches ) ) {
		return html_entity_decode( $matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}
	$barePattern = '/\s' . preg_quote( $name, '/' ) . '\s*=\s*([^\s>]+)/i';
	if ( preg_match( $barePattern, $tag, $matches ) ) {
		return html_entity_decode( $matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}
	return null;
}

function stylesheetSourceName( string $href ): ?string {
	if ( preg_match( '#^data:text/css(?:;charset=[^;,]+)?;base64,#i', $href ) ) {
		return 'inline-css';
	}

	$parts = parse_url( $href );
	if ( !is_array( $parts ) || !isset( $parts['query'] ) ) {
		return null;
	}
	parse_str( $parts['query'], $query );
	if ( !isset( $query['title'] ) ) {
		return null;
	}
	return str_replace( '_', ' ', (string)$query['title'] );
}

function cssTextForStylesheetHref( string $href ): ?string {
	if ( preg_match( '#^data:text/css(?:;charset=[^;,]+)?;base64,(.*)$#i', $href, $matches ) ) {
		$decoded = base64_decode( $matches[1], true );
		return $decoded === false ? null : $decoded;
	}

	$parts = parse_url( $href );
	if ( !is_array( $parts ) || !isset( $parts['query'] ) ) {
		return null;
	}
	parse_str( $parts['query'], $query );
	if ( !isset( $query['title'] ) ) {
		return null;
	}

	$text = cssTextForTitle( str_replace( '_', ' ', (string)$query['title'] ) );
	return $text === null ? null : Sanitizer::checkCss( $text );
}

function cssTextForTitle( string $titleText ): ?string {
	$title = Title::newFromText( $titleText );
	if ( !$title ) {
		return null;
	}
	$content = WikiPage::factory( $title )->getContent();
	if ( !$content || !method_exists( $content, 'getText' ) ) {
		return null;
	}
	return $content->getText();
}

function collectDiagnostics( ParserOutput $output ): array {
	$diagnostics = [];
	$scribuntoErrors = $output->getExtensionData( 'ScribuntoErrors' );
	if ( is_array( $scribuntoErrors ) ) {
		foreach ( $scribuntoErrors as $error ) {
			$diagnostics[] = [
				'severity' => 'error',
				'code' => 'scribunto-error',
				'message' => is_string( $error ) ? $error : json_encode( $error, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES )
			];
		}
	}
	return $diagnostics;
}
