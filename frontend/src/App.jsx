import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Councils from './pages/Councils'
import CouncilEditor from './pages/CouncilEditor'
import Chamber from './pages/Chamber'
import History from './pages/History'

export default function App() {
  return (
    <>
      <Sidebar />
      <main
        style={{
          marginLeft: '260px',
          flex: 1,
          minHeight: '100vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '32px 40px 48px',
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/councils" element={<Councils />} />
            <Route path="/councils/new" element={<CouncilEditor />} />
            <Route path="/councils/:id/edit" element={<CouncilEditor />} />
            <Route path="/chamber" element={<Chamber />} />
            <Route path="/chamber/:sessionId" element={<Chamber />} />
          </Routes>
        </div>
      </main>
    </>
  )
}
