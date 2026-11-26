import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushSender } from '../notifications/notifications.module';

/** Avisos dentro do app (cobrança do professor, recados da escola). ADR 0020. */
@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
  ) {}

  /** Cria o aviso e manda o push (quando o PushSender estiver ligado). */
  async send(n: { tenantId?: string | null; userId: string; senderId?: string | null; title: string; body: string; deviceTokens?: string[] }) {
    const notice = await this.prisma.notice.create({
      data: { tenantId: n.tenantId ?? null, userId: n.userId, senderId: n.senderId ?? null, title: n.title, body: n.body },
    });
    if (n.deviceTokens?.length) await this.push.send(n.deviceTokens, n.title, n.body);
    return notice;
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, title: true, body: true, readAt: true, createdAt: true, sender: { select: { name: true } }, tenant: { select: { tradeName: true } } },
      }),
      this.prisma.notice.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items };
  }

  async markRead(userId: string, id: string) {
    const r = await this.prisma.notice.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notice.count({ where: { id, userId } }))) throw new NotFoundException('Aviso não encontrado');
    return { read: true };
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.notice.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { read: r.count };
  }
}
