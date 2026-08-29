import UnsubscribeForm from "./UnsubscribeForm"

// Renders and writes nothing; it does not look the token up, so an unknown
// token reaches the same screen as a real one and a stranger holding a
// guessed token learns nothing from the difference.

export const metadata = { title: "Unsubscribe" }

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 20px" }}>
      <UnsubscribeForm token={token} />
    </main>
  )
}
