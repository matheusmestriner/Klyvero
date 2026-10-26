import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { CrudService } from './crud.service';
import { AgentDto, CompanyDto, ContactDto, EventDto, IntegrationDto, LeadDto, UpdateEventDto } from './dto';

const WRITE=[UserRole.OWNER,UserRole.ADMIN,UserRole.MANAGER,UserRole.SDR,UserRole.MEMBER];
@Controller()
export class CrudController {
  constructor(private readonly service:CrudService){}
  private tenant(user:AuthUser){return user.tenantId}

  @Feature('leads') @Get('leads') leads(@CurrentUser()u:AuthUser){return this.service.leads(this.tenant(u))}
  @Feature('leads') @Roles(...WRITE) @Post('leads') lead(@CurrentUser()u:AuthUser,@Body()d:LeadDto){return this.service.createLead(this.tenant(u),d)}
  @Feature('leads') @Roles(...WRITE) @Patch('leads/:id') updateLead(@CurrentUser()u:AuthUser,@Param('id')id:string,@Body()d:LeadDto){return this.service.updateLead(this.tenant(u),id,d)}
  @Feature('leads') @Roles(...WRITE) @Delete('leads/:id') deleteLead(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.deleteLead(this.tenant(u),id)}

  @Feature('companies') @Get('companies') companies(@CurrentUser()u:AuthUser){return this.service.companies(this.tenant(u))}
  @Feature('companies') @Roles(...WRITE) @Post('companies') company(@CurrentUser()u:AuthUser,@Body()d:CompanyDto){return this.service.createCompany(this.tenant(u),d)}
  @Feature('companies') @Roles(...WRITE) @Delete('companies/:id') deleteCompany(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.deleteCompany(this.tenant(u),id)}

  @Feature('contacts') @Get('contacts') contacts(@CurrentUser()u:AuthUser){return this.service.contacts(this.tenant(u))}
  @Feature('contacts') @Roles(...WRITE) @Post('contacts') contact(@CurrentUser()u:AuthUser,@Body()d:ContactDto){return this.service.createContact(this.tenant(u),d)}
  @Feature('contacts') @Roles(...WRITE) @Delete('contacts/:id') deleteContact(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.deleteContact(this.tenant(u),id)}

  @Feature('ai_agents') @Get('ai-agents') agents(@CurrentUser()u:AuthUser){return this.service.agents(this.tenant(u))}
  @Feature('ai_agents') @Roles(...WRITE) @Post('ai-agents') agent(@CurrentUser()u:AuthUser,@Body()d:AgentDto){return this.service.createAgent(this.tenant(u),d)}
  @Feature('ai_agents') @Roles(...WRITE) @Patch('ai-agents/:id/active') toggle(@CurrentUser()u:AuthUser,@Param('id')id:string,@Query('value')v:string){return this.service.toggleAgent(this.tenant(u),id,v==='true')}

  @Feature('calendar') @Get('calendar') events(@CurrentUser()u:AuthUser){return this.service.events(this.tenant(u))}
  @Feature('calendar') @Roles(...WRITE) @Post('calendar') event(@CurrentUser()u:AuthUser,@Body()d:EventDto){return this.service.createEvent(this.tenant(u),d)}
  @Feature('calendar') @Roles(...WRITE) @Patch('calendar/:id') updateEvent(@CurrentUser()u:AuthUser,@Param('id')id:string,@Body()d:UpdateEventDto){return this.service.updateEvent(this.tenant(u),id,d)}
  @Feature('calendar') @Roles(...WRITE) @Delete('calendar/:id') deleteEvent(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.deleteEvent(this.tenant(u),id)}

  @Feature('integrations') @Get('integrations') integrations(@CurrentUser()u:AuthUser){return this.service.integrations(this.tenant(u))}
  @Feature('integrations') @Roles(UserRole.OWNER,UserRole.ADMIN) @Post('integrations') integration(@CurrentUser()u:AuthUser,@Body()d:IntegrationDto){return this.service.integration(this.tenant(u),d)}

  @Feature('whatsapp') @Get('inbox') inbox(@CurrentUser()u:AuthUser){return this.service.threads(this.tenant(u))}
  // Declared before ':id' so 'messages' is never captured as a conversation id.
  @Feature('whatsapp') @Roles(...WRITE) @Delete('inbox/messages/:id') deleteInboxMessage(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.deleteInboxMessage(this.tenant(u),id)}
  @Feature('whatsapp') @Roles(...WRITE) @Delete('inbox/:id') deleteInboxThread(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.deleteInboxThread(this.tenant(u),id)}
  @Roles(UserRole.OWNER,UserRole.ADMIN) @Get('audit') audit(@CurrentUser()u:AuthUser){return this.service.audits(this.tenant(u))}
}
