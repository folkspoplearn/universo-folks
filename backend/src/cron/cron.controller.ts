import { Controller, Get, Headers, HttpCode, Module, NotFoundException, Param, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../common/decorators';
import { BillingModule } from '../billing/billing.module';
import { BillingService } from '../billing/billing.service';
import { NotificationsModule, RemindersJob } from '../notifications/notifications.module';

/**
 * Tarefas agendadas chamadas pelo Vercel Cron (GET com "Authorization: Bearer CRON_SECRET").
 * Fora da Vercel as mesmas tarefas rodam pelo @nestjs/schedule (@Cron) e esta rota só serve
 * para disparo manual.
 */
@ApiExcludeController()
@Controller('cron')
export class CronController {
  constructor(
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly reminders: RemindersJob,
  ) {}

  @Public() @Get(':job') @HttpCode(200)
  async run(@Param('job') job: string, @Headers('authorization') auth?: string) {
    this.assertSecret(auth);
    const started = Date.now();
    switch (job) {
      case 'expire-subscriptions': await this.billing.expireSubscriptions(); break;
      case 'daily-reminder': await this.reminders.dailyReminder(); break;
      default: throw new NotFoundException('Tarefa não encontrada');
    }
    return { job, ok: true, ms: Date.now() - started };
  }

  private assertSecret(auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) throw new ServiceUnavailableException('CRON_SECRET não configurado');
    const a = Buffer.from(auth ?? '');
    const b = Buffer.from(`Bearer ${secret}`);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
  }
}

@Module({ imports: [BillingModule, NotificationsModule], controllers: [CronController] })
export class CronModule {}
