import { useRoute } from './lib/router'
import { WalletProvider } from './wallet/WalletContext'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { VaultsPage } from './pages/VaultsPage'
import { VaultDetailPage } from './pages/VaultDetailPage'

export function App() {
  const route = useRoute()

  return (
    <WalletProvider>
      <div className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
          {route.name === 'vault' ? (
            <VaultDetailPage address={route.address} />
          ) : (
            <VaultsPage />
          )}
        </main>
        <Footer />
      </div>
    </WalletProvider>
  )
}
