<?php

// Installs MediaWiki for ja-ucp-preview without going through install.php's
// environment checks. This is a near-verbatim copy of maintenance/install.php
// CommandLineInstaller::execute() but it runs env checks for their side
// effects only and never aborts when a benign warning (e.g. missing FTS3 on
// PHP/WASM's SQLite) shows up.

error_reporting( E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_RECOVERABLE_ERROR );
ini_set( 'display_errors', '1' );
ini_set( 'log_errors', '1' );
ini_set( 'memory_limit', '512M' );

if ( !defined( 'STDIN' ) ) { define( 'STDIN', fopen( 'php://stdin', 'rb' ) ); }
if ( !defined( 'STDOUT' ) ) { define( 'STDOUT', fopen( 'php://stdout', 'wb' ) ); }
if ( !defined( 'STDERR' ) ) { define( 'STDERR', fopen( 'php://stderr', 'wb' ) ); }

$IP = getenv( 'MW_INSTALL_PATH' );
if ( !$IP ) {
	fwrite( STDERR, "MW_INSTALL_PATH is required.\n" );
	exit( 2 );
}

$siteName = $argv[1] ?? 'Uncyclopedia';
$adminName = $argv[2] ?? 'PreviewAdmin';
$argv = [
	'ja-ucp-install.php',
	'--scriptpath', getenv( 'JA_UCP_SCRIPTPATH' ) ?: '',
	'--server', getenv( 'JA_UCP_SERVER' ) ?: 'https://ansaikuropedia.org',
	'--lang', getenv( 'JA_UCP_LANG' ) ?: 'ja',
	'--dbtype', 'sqlite',
	'--dbpath', getenv( 'JA_UCP_DBPATH' ) ?: '',
	'--dbname', getenv( 'JA_UCP_DBNAME' ) ?: 'ja_ucp_preview',
	'--dbuser', '',
	'--dbpass', '',
	'--pass', getenv( 'JA_UCP_PASS' ) ?: 'PreviewPass',
	'--confpath', getenv( 'JA_UCP_CONFPATH' ) ?: '',
	$siteName,
	$adminName
];
$argc = count( $argv );
$_SERVER['argv'] = $argv;
$_SERVER['argc'] = $argc;

// Mirror install.php bootstrap exactly except: never reach the original
// `$maintClass = CommandLineInstaller::class; require_once RUN_MAINTENANCE_IF_MAIN;`
// tail of install.php.
use Wikimedia\AtEase\AtEase;

require_once $IP . '/maintenance/Maintenance.php';

if ( !defined( 'MW_CONFIG_CALLBACK' ) ) {
	define( 'MW_CONFIG_CALLBACK', 'Installer::overrideConfig' );
}
if ( !defined( 'MEDIAWIKI_INSTALL' ) ) {
	define( 'MEDIAWIKI_INSTALL', true );
}

class JaUcpPreviewCommandLineInstaller extends Maintenance {
	public function __construct() {
		parent::__construct();
		global $IP;

		$this->addDescription( "ja-ucp-preview internal installer (mirrors install.php)" );

		$this->addArg( 'name', 'The name of the wiki (MediaWiki)', false );
		$this->addArg( 'admin', 'The username of the wiki administrator.' );
		$this->addOption( 'pass', 'The password for the wiki administrator.', false, true );
		$this->addOption( 'passfile', 'An alternative way to provide pass option', false, true );
		$this->addOption( 'scriptpath', 'The relative path of the wiki in the web server', false, true );
		$this->addOption( 'server', 'The base URL of the web server the wiki will be on', false, true );
		$this->addOption( 'lang', 'The language to use', false, true );
		$this->addOption( 'dbtype', 'The type of database', false, true );
		$this->addOption( 'dbserver', 'The database host', false, true );
		$this->addOption( 'dbport', 'The database port', false, true );
		$this->addOption( 'dbname', 'The database name', false, true );
		$this->addOption( 'dbpath', 'The path for the SQLite DB', false, true );
		$this->addOption( 'dbprefix', 'Optional database table name prefix', false, true );
		$this->addOption( 'installdbuser', 'The user to use for installing', false, true );
		$this->addOption( 'installdbpass', 'The password for the DB user to install as.', false, true );
		$this->addOption( 'dbuser', 'The user to use for normal operations', false, true );
		$this->addOption( 'dbpass', 'The password for the DB user for normal operations', false, true );
		$this->addOption( 'dbpassfile', 'An alternative way to provide dbpass', false, true );
		$this->addOption( 'confpath', 'Path to write LocalSettings.php to', false, true );
		$this->addOption( 'dbschema', 'The schema for the MediaWiki DB in PostgreSQL', false, true );
		$this->addOption( 'env-checks', "Run environment checks only" );
		$this->addOption( 'with-extensions', "Detect and include extensions" );
		$this->addOption( 'extensions', 'Comma-separated list of extensions to install', false, true, false, true );
		$this->addOption( 'skins', 'Comma-separated list of skins to install', false, true, false, true );
		$this->addOption( 'with-developmentsettings', 'Load DevelopmentSettings.php' );
	}

	public function getDbType() {
		return Maintenance::DB_NONE;
	}

	public function execute() {
		global $IP;

		$siteName = $this->getArg( 0, 'MediaWiki' );
		$adminName = $this->getArg( 1 );
		$this->setDbPassOption();
		$this->setPassOption();

		try {
			$installer = InstallerOverrides::getCliInstaller(
				$siteName, $adminName, $this->mOptions
			);
		} catch ( \MediaWiki\Installer\InstallException $e ) {
			$this->output( $e->getStatus()->getMessage( false, false, 'en' )->text() . "\n" );
			return false;
		}

		$reflection = new ReflectionClass( $installer );

		$envPrepsProp = $reflection->getProperty( 'envPreps' );
		$envPrepsProp->setAccessible( true );
		foreach ( $envPrepsProp->getValue( $installer ) as $prep ) {
			$method = $reflection->getMethod( $prep );
			$method->setAccessible( true );
			$method->invoke( $installer );
		}

		$envChecksProp = $reflection->getProperty( 'envChecks' );
		$envChecksProp->setAccessible( true );
		foreach ( $envChecksProp->getValue( $installer ) as $check ) {
			try {
				$method = $reflection->getMethod( $check );
				$method->setAccessible( true );
				$method->invoke( $installer );
			} catch ( Throwable $e ) {
				fwrite( STDERR, "(env check $check ignored: " . $e->getMessage() . ")\n" );
			}
		}

		fwrite( STDERR, "[ja-ucp-install] starting installer->execute()\n" );
		$status = $installer->execute();
		fwrite( STDERR, "[ja-ucp-install] installer->execute() returned\n" );
		fwrite( STDERR, "[ja-ucp-install] isOK=" . ( $status->isOK() ? 'true' : 'false' ) . "\n" );
		if ( !$status->isOK() ) {
			fwrite( STDERR, "[ja-ucp-install] status=" . $status->getMessage( false, false, 'en' )->text() . "\n" );
			$installer->showStatusMessage( $status );
			return false;
		}
		$installer->writeConfigurationFile( $this->getOption( 'confpath', $IP ) );
		$installer->showMessage(
			'config-install-success',
			$installer->getVar( 'wgServer' ),
			$installer->getVar( 'wgScriptPath' )
		);
		return true;
	}

	public function validateParamsAndArgs() {
		if ( !$this->hasOption( 'env-checks' ) ) {
			parent::validateParamsAndArgs();
		}
	}

	private function setDbPassOption() {
		$dbpassfile = $this->getOption( 'dbpassfile' );
		if ( $dbpassfile !== null ) {
			if ( $this->getOption( 'dbpass' ) !== null ) {
				$this->error( 'WARNING: dbpassfile overrides dbpass.' );
			}
			AtEase::suppressWarnings();
			$dbpass = file_get_contents( $dbpassfile );
			AtEase::restoreWarnings();
			if ( $dbpass === false ) {
				$this->fatalError( "Could not open $dbpassfile" );
			}
			$this->mOptions['dbpass'] = trim( $dbpass, "\r\n" );
		}
	}

	private function setPassOption() {
		$passfile = $this->getOption( 'passfile' );
		if ( $passfile !== null ) {
			if ( $this->getOption( 'pass' ) !== null ) {
				$this->error( 'WARNING: passfile overrides pass.' );
			}
			AtEase::suppressWarnings();
			$pass = file_get_contents( $passfile );
			AtEase::restoreWarnings();
			if ( $pass === false ) {
				$this->fatalError( "Could not open $passfile" );
			}
			$this->mOptions['pass'] = trim( $pass, "\r\n" );
		} elseif ( $this->getOption( 'pass' ) === null ) {
			$this->fatalError( 'You need to provide the option "pass" or "passfile"' );
		}
	}
}

$maintClass = JaUcpPreviewCommandLineInstaller::class;

require_once RUN_MAINTENANCE_IF_MAIN;
