/**
 * URL of a file under client/public, with the build's art version stamped on.
 *
 * nginx caches a versioned art URL for a year (docker/nginx.conf), which is
 * only safe because the version moves exactly when the art does: the
 * Dockerfile sets REACT_APP_ASSET_VERSION to a hash of the PNG masters, so a
 * redrawn card gets a new query string and every browser fetches it fresh.
 * Unset under `npm start` and in tests, where the URL is the bare path.
 */
const VERSION = process.env.REACT_APP_ASSET_VERSION;

export const assetUrl = (path: string): string =>
  VERSION ? `${path}?v=${VERSION}` : path;
