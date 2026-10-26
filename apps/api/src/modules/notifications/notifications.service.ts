import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma:PrismaService){}
  list(tenantId:string,userId:string){return this.prisma.notification.findMany({where:{tenantId,OR:[{userId},{userId:null}]},orderBy:{createdAt:'desc'},take:100})}
  create(tenantId:string,title:string,body?:string,type:NotificationType='INFO',userId?:string){return this.prisma.notification.create({data:{tenantId,title,body,type,userId}})}
  markRead(tenantId:string,userId:string,id:string){return this.prisma.notification.updateMany({where:{id,tenantId,OR:[{userId},{userId:null}]},data:{readAt:new Date()}})}
}
