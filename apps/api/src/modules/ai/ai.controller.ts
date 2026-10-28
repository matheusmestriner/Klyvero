import { Body,Controller,Get,Param,Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { AuthUser } from '../../common/auth.types';
import { AiService } from './ai.service';
import { ProspectAiDto,ReplyAiDto,RunAgentDto } from './dto';
@Feature('ai_agents') @Controller('ai-agents')
export class AiController{constructor(private readonly ai:AiService){} @Post(':id/run')run(@CurrentUser()u:AuthUser,@Param('id')id:string,@Body()d:RunAgentDto){return this.ai.run(u.tenantId,id,d.input)} @Post('tools/score-prospect')score(@CurrentUser()u:AuthUser,@Body()d:ProspectAiDto){return this.ai.scoreProspect(u.tenantId,d.prospectId,d.offer)} @Post('tools/personalize')personalize(@CurrentUser()u:AuthUser,@Body()d:ProspectAiDto){return this.ai.personalize(u.tenantId,d.prospectId,d.offer)} @Post('tools/classify-reply')classify(@CurrentUser()u:AuthUser,@Body()d:ReplyAiDto){return this.ai.classifyReply(u.tenantId,d.message,d.context)} @Get('executions')executions(@CurrentUser()u:AuthUser){return this.ai.executions(u.tenantId)}}
