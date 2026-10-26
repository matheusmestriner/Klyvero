import { Controller,Get,Param,Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthUser } from '../../common/auth.types';
import { NotificationsService } from './notifications.service';
@Controller('notifications')
export class NotificationsController {constructor(private readonly service:NotificationsService){} @Get() list(@CurrentUser()u:AuthUser){return this.service.list(u.tenantId,u.sub)} @Post(':id/read') read(@CurrentUser()u:AuthUser,@Param('id')id:string){return this.service.markRead(u.tenantId,u.sub,id)}}
