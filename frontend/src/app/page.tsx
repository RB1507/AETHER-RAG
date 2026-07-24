import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const cookieStore = await cookies()
  const isAuthenticated = cookieStore.get('aether_authenticated')?.value === 'true'

  if (isAuthenticated) {
    redirect('/chat')
  } else {
    redirect('/login')
  }
}
