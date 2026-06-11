import { useEffect, useState } from 'react'

export type Route = { name: 'vaults' } | { name: 'vault'; address: `0x${string}` }

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts[0] === 'vault' && parts[1] && /^0x[0-9a-fA-F]{40}$/.test(parts[1])) {
    return { name: 'vault', address: parts[1] as `0x${string}` }
  }
  return { name: 'vaults' }
}

/** Minimal hash-based router (no react-router dependency). */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(route: Route): void {
  const hash = route.name === 'vault' ? `#/vault/${route.address}` : '#/vaults'
  if (window.location.hash !== hash) {
    window.location.hash = hash
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}
