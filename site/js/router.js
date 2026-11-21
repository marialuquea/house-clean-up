import { useEffect, useState } from './deps.js';

export const getPath = () => location.hash.replace(/^#/, '') || '/';
export const href = (path) => '#' + path;
export const navigate = (path) => {
  location.hash = path;
};

export function usePath() {
  const [path, setPath] = useState(getPath());
  useEffect(() => {
    const onChange = () => setPath(getPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}
