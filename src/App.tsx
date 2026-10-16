import { useState } from 'react'
import type { GreenApi } from './chat/api'
import { ConnectionForm } from './components/ConnectionForm'
import { ChatWorkspace } from './components/ChatWorkspace'

export default function App() {
  const [session, setSession] = useState<{ api: GreenApi; instanceId: string } | null>(null)
  return session ? (
    <ChatWorkspace
      api={session.api}
      instanceId={session.instanceId}
      onDisconnect={() => setSession(null)}
    />
  ) : (
    <ConnectionForm onConnected={(api, instanceId) => setSession({ api, instanceId })} />
  )
}
