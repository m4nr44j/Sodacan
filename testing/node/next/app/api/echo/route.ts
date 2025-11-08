export async function GET() {
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), { status: 201 })
} 