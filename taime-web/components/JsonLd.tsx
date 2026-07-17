// Renderiza um bloco JSON-LD server-side (aparece no HTML de view-source).
// Escapa '<' para impedir quebra do </script> (seguranca contra injecao).
export default function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
