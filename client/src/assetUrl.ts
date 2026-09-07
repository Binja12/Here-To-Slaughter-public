import { catalog, sourcePath } from './loading/catalog';

const VERSION = process.env.REACT_APP_ASSET_VERSION;

export function assetUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('/generated/')) return path;
  const source = sourcePath(path);
  const version = catalog.files[source] ?? VERSION;
  return version ? `${source}?v=${version}` : path;
}
