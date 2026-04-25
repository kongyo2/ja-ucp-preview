# @kongyo2/ja-ucp-preview

Japanese Uncyclopedia preview renderer for TypeScript/Node.js.

## Requirements

`NativePhpBackend` (the default backend) shells out to a local PHP CLI to run
the bundled MediaWiki 1.39.3. The runtime environment must provide:

- **PHP 8.3.x**
- PHP extensions: `intl`, `mbstring`, `sqlite3`, `pdo_sqlite`, `xml`, `curl`, `gd`

If `php` on `PATH` does not point to a PHP 8.3 binary, pass an explicit binary
path or name via `phpBinary`:

```ts
import { createNativePhpBackend, createJaUcpRenderer } from "@kongyo2/ja-ucp-preview";

const renderer = createJaUcpRenderer({
  backend: createNativePhpBackend({ phpBinary: "php8.3" })
});
```
