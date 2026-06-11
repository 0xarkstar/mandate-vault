export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-mist-400 sm:flex-row sm:items-center sm:justify-between">
        <p>MandateVault — verifiable mandate enforcement for autonomous agents on Mantle</p>
        <a
          href="https://github.com/your-org/mandate-vault"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-mist-300 underline-offset-4 hover:text-mist-100 hover:underline"
        >
          GitHub ↗
        </a>
      </div>
    </footer>
  )
}
