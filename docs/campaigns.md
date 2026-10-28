# Campanhas (cadências)

Uma campanha é uma sequência de passos (e-mail e/ou WhatsApp) enviada a leads. Cada lead inscrito é um *enrollment* que anda passo a passo até responder, concluir, ser interrompido ou falhar.

## Como funciona

O **banco é a agenda**. Cada passo agendado é uma linha `SequenceStepRun` com `status = QUEUED` e `scheduledAt`. Um agendador dentro da API (`SequenceScheduler`) roda a cada `SEQUENCE_TICK_SECONDS` (padrão 15 s), reivindica os passos vencidos com `FOR UPDATE SKIP LOCKED` (duas instâncias nunca pegam o mesmo passo) e envia.

Consequências:

- **Não precisa de Redis.** Reiniciar a API, ou perder um cache, não perde agendamentos.
- Se o processo estiver parado (por exemplo, serviço gratuito do Render dormindo), os passos vencidos saem quando ele acordar. **Os envios atrasam, mas não se perdem.** Para horários precisos, use um plano que não durma.
- Passos presos em `RUNNING` por mais de 10 minutos (processo que caiu no meio) voltam para a fila.

## Estados

| Enrollment | Significado |
|---|---|
| `ACTIVE` | Em andamento |
| `PAUSED` | Campanha pausada, ou lead adicionado antes de iniciar |
| `REPLIED` | O lead respondeu. A cadência para |
| `COMPLETED` | Todos os passos foram processados |
| `STOPPED` | Parado manualmente, ou o lead se descadastrou |
| `FAILED` | Um passo falhou de forma definitiva. Dá para "Tentar de novo" |

Passos: `QUEUED` → `RUNNING` → `SENT`, `SKIPPED` (nada a enviar a esse lead, por exemplo sem e-mail ou descadastrado), `FAILED` ou `CANCELED`.

## Regras de envio

- **Retentativas:** erro temporário (SMTP fora do ar etc.) tenta de novo após 1, 2 e 4 minutos (`SEQUENCE_MAX_ATTEMPTS`, padrão 3). Depois disso o enrollment vira `FAILED`.
- **Adiamento sem falha:** cota mensal estourada ou assinatura inativa adia o passo em 1 hora; WhatsApp sem sessão conectada adia em 5 minutos. Isso não consome tentativas nem derruba o lead.
- **Erros definitivos** (caixa de e-mail inexistente, campanha sem caixa) falham na hora, sem retentativas inúteis.
- **WhatsApp:** no máximo um envio a cada `WHATSAPP_MIN_INTERVAL_SECONDS` (padrão 20 s, com variação aleatória) por workspace, para reduzir o risco de bloqueio do número. Telefones sem código de país são tratados como brasileiros.
- **E-mail:** o corpo sai com um link visível de descadastro, além dos cabeçalhos `List-Unsubscribe`. Quem se descadastra tem todas as cadências em andamento interrompidas e nunca mais recebe e-mail do workspace.
- **Iniciar** valida a campanha: precisa de passos e, se houver passo de e-mail, de uma caixa de envio ativa. Sem sessão de WhatsApp, inicia com um aviso.
- A verificação de resposta/pausa é refeita **logo antes de enviar**, então quem responde enquanto o passo está na fila não recebe a mensagem.

## Parar ao receber resposta

| Canal | Como chega a resposta |
|---|---|
| WhatsApp | A ponte Go envia o evento `message` para `POST /api/v1/internal/whatsapp/events`. O telefone do lead é comparado em formato canônico (ignora máscara, `+55` e o nono dígito) |
| E-mail | Não há leitura de caixa de entrada. O provedor de *inbound* (ou um encaminhamento) precisa chamar `POST /api/v1/email/inbound` com o cabeçalho `x-inbound-token: <EMAIL_INBOUND_TOKEN>` e o corpo abaixo |

```json
{ "tenantId": "<uuid do workspace>", "from": "lead@empresa.com", "to": "comercial@seudominio.com", "subject": "Re: ...", "text": "..." }
```

Sem essa integração de e-mail, use **Ver leads → Parar** para interromper quem respondeu por outro caminho.

Uma resposta (por qualquer canal) marca o lead como `REPLIED` e interrompe as cadências dele em **todas** as campanhas.

## Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `RUN_SEQUENCE_SCHEDULER` | `true` | `false` desliga o agendador nesta instância |
| `SEQUENCE_TICK_SECONDS` | `15` | Intervalo entre passadas |
| `SEQUENCE_MAX_ATTEMPTS` | `3` | Tentativas por passo em erros temporários |
| `SEQUENCE_MAX_PER_TICK` | `50` | Teto de passos por passada |
| `WHATSAPP_MIN_INTERVAL_SECONDS` | `20` | Intervalo mínimo entre WhatsApps do workspace |
| `EMAIL_INBOUND_TOKEN` | — | Token de `POST /email/inbound` (≥ 32 caracteres) |

## Testes

`pnpm --filter @klyvero/api test` roda os testes unitários. `pnpm --filter @klyvero/api test:e2e` sobe a API de verdade contra um PostgreSQL descartável (`DATABASE_URL`, **todas as tabelas são truncadas**), com SMTP e ponte de WhatsApp falsos, e cobre o ciclo completo: envio, atraso, resposta, pausa, descadastro, retentativas, pacing, concorrência, isolamento entre workspaces e permissões. A CI executa os dois.
