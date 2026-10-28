import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly usage: UsageService) {}

  private modelAllowed(model: string) {
    const defaults = [this.config.get('OPENAI_DEFAULT_MODEL') ?? 'gpt-5.6'];
    const configured = (this.config.get<string>('OPENAI_ALLOWED_MODELS') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    const allowed = new Set([...defaults, ...configured]);
    if (!allowed.has(model)) throw new BadRequestException('AI model is not allowed for this deployment');
  }

  private async response(tenantId: string, purpose: string, model: string, instructions: string, input: string, agentId?: string) {
    this.modelAllowed(model);
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key) throw new ServiceUnavailableException('AI provider is not configured');
    await this.usage.assertAndIncrement(tenantId, 'ai_runs', 1);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, reasoning: { effort: 'low' }, instructions, input }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      this.logger.error(`AI request failed: ${error instanceof Error ? error.message : 'network error'}`);
      throw new ServiceUnavailableException('AI provider is temporarily unavailable');
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2000);
      this.logger.warn(`AI provider returned ${response.status}: ${detail}`);
      throw new ServiceUnavailableException('AI provider rejected the request');
    }
    const data: any = await response.json();
    const text = (data.output ?? []).flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('\n');
    await this.prisma.aiExecution.create({ data: { tenantId, agentId, purpose, model: data.model ?? model, responseId: data.id, input: { text: input }, output: { text }, inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, latencyMs: Date.now() - started } });
    return { model: data.model ?? model, responseId: data.id, output: text, usage: data.usage ?? null };
  }

  async run(tenantId: string, agentId: string, input: string) {
    const agent = await this.prisma.aiAgent.findFirst({ where: { id: agentId, tenantId, active: true } });
    if (!agent) throw new NotFoundException('Active AI agent not found');
    const result = await this.response(tenantId, 'agent.run', agent.model || this.config.get('OPENAI_DEFAULT_MODEL') || 'gpt-5.6', `${agent.systemPrompt}\nTom: ${agent.tone}. Não invente fatos sobre o lead.`, input, agent.id);
    return { agentId: agent.id, ...result };
  }

  async scoreProspect(tenantId: string, prospectId: string, offer?: string) {
    const p = await this.prisma.prospect.findFirst({ where: { id: prospectId, tenantId } });
    if (!p) throw new NotFoundException('Prospect not found');
    const input = JSON.stringify({ prospect: { firstName: p.firstName, lastName: p.lastName, companyName: p.companyName, jobTitle: p.jobTitle, industry: p.industry, website: p.website, city: p.city, state: p.state, country: p.country }, offer: offer ?? null });
    const r = await this.response(tenantId, 'prospect.score', this.config.get('OPENAI_DEFAULT_MODEL') || 'gpt-5.6', 'Avalie aderência comercial de 0 a 100. Responda SOMENTE JSON válido no formato {"score":number,"reason":string,"angles":string[]}.', input);
    let parsed: any; try { parsed = JSON.parse(r.output); } catch { parsed = { score: null, reason: r.output, angles: [] }; }
    if (typeof parsed.score === 'number') await this.prisma.prospect.update({ where: { id: p.id }, data: { score: Math.max(0, Math.min(100, Math.round(parsed.score))) } });
    return { ...r, result: parsed };
  }

  async personalize(tenantId: string, prospectId: string, offer?: string) {
    const p = await this.prisma.prospect.findFirst({ where: { id: prospectId, tenantId } });
    if (!p) throw new NotFoundException('Prospect not found');
    return this.response(tenantId, 'prospect.personalize', this.config.get('OPENAI_DEFAULT_MODEL') || 'gpt-5.6', 'Crie uma abordagem B2B curta, específica e verificável. Não invente informações. Retorne assunto e corpo em português do Brasil.', JSON.stringify({ prospect: p, offer: offer ?? null }));
  }

  classifyReply(tenantId: string, message: string, context?: string) {
    return this.response(tenantId, 'reply.classify', this.config.get('OPENAI_DEFAULT_MODEL') || 'gpt-5.6', 'Classifique a resposta comercial. Retorne SOMENTE JSON válido {"intent":"positive|negative|question|meeting|unsubscribe|other","confidence":0.0,"suggestedReply":string,"shouldStopSequence":boolean}.', JSON.stringify({ message, context: context ?? null }));
  }

  executions(tenantId: string) { return this.prisma.aiExecution.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }); }
}
