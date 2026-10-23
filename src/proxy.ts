import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção de acesso do MVP (enquanto não há login com Supabase Auth).
 * Se APP_SENHA estiver definida, todas as páginas exigem HTTP Basic Auth:
 * qualquer usuário + a senha. Sem APP_SENHA (dev local) nada é exigido.
 * O plano Hobby da Vercel só protege URLs de preview com o Vercel
 * Authentication; isto cobre também o domínio de produção.
 */
export function proxy(req: NextRequest) {
  const senha = process.env.APP_SENHA;
  if (!senha) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decodificado = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const separador = decodificado.indexOf(":");
    const informada = separador >= 0 ? decodificado.slice(separador + 1) : "";
    if (informada === senha) return NextResponse.next();
  }

  return new NextResponse("Acesso restrito ao controle de comissões.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Controle de comissoes", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
