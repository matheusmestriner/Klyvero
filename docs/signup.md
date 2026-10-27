# Cadastro do dono da empresa (white label)

Uma única forma de entrar como revenda white label: **link de convite de uso único** emitido pelo dono (ou admin) do
workspace da plataforma. Não existe cadastro aberto.

## Fluxo

1. **Plataforma** (Organizações → "Convites de cadastro"): informa para quem é o convite, opcionalmente o e-mail do dono e a
   validade (3 a 30 dias, padrão 7). O link `…/cadastro?token=…` aparece **uma vez**; o banco guarda só o hash (SHA-256).
2. **Dono da empresa** abre o link. A página mostra para quem é o convite e pede: empresa, CPF/CNPJ, workspace (o que ele
   digita para entrar), responsável, e-mail, senha (mín. 12) e, opcionalmente, nome do produto e cor principal.
3. O cadastro cria, numa transação: workspace `RESELLER` filho da plataforma, usuário `OWNER`, pipeline padrão e a marca
   inicial. O convite é consumido. Logo, domínio, textos de login etc. ele configura na tela **Branding** (o recurso
   `white_label` vem ligado, e campos não preenchidos continuam herdando a marca da plataforma).
4. Se o SMTP do sistema (`SMTP_DEFAULT_*`) estiver configurado, o dono recebe um e-mail de boas-vindas.

## Regras

- **Uso único:** o primeiro cadastro a marcar o convite como usado vence (duas requisições simultâneas: uma passa, a outra
  recebe 400). Se o cadastro falha por conflito, o convite **não** é consumido.
- **Um cadastro por e-mail e por CPF/CNPJ** (dígitos verificadores validados; `Tenant.legalDocument` é único). O workspace
  também é único, e nomes reservados (`admin`, `api`, `app`, `login`…) são recusados.
- Convite com e-mail definido só aceita esse e-mail.
- Convite expirado, revogado ou já usado responde 404 na verificação e 400 no cadastro (mesma mensagem para os três).
- Só `OWNER`/`ADMIN` do workspace do tipo `PLATFORM` emite, lista e revoga convites. Revendas e clientes recebem 403.
- Endpoints públicos passam pelo limitador de requisições do grupo `auth` e recusam requisições de navegador vindas de
  outros sites (mesma checagem de origem do login).

## API

| Método | Rota | Quem |
| --- | --- | --- |
| `POST` | `/signup-invites` `{ label, email?, validityDays? }` → `{ id, url, expiresAt }` | dono/admin da plataforma |
| `GET` | `/signup-invites` | idem |
| `DELETE` | `/signup-invites/:id` | idem |
| `POST` | `/signup/invite/check` `{ token }` | público |
| `POST` | `/signup` `{ token, companyName, document, responsibleName, email, password, slug, productName?, primaryColor? }` | público |

Testes: `apps/api/src/modules/signup/signup.e2e-spec.ts` (e2e) e `apps/api/src/common/br-document.spec.ts`.
