import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GuardianService } from './guardian.service';
import { NoticesService } from './notices.service';
import { SchoolAdminService } from './school-admin.service';
import { SchoolReportService } from './school-report.service';
import { GuardianController, MeSchoolController, SchoolAdminController, TeacherController } from './school.controllers';
import { TeacherService } from './teacher.service';

/** Escola: turmas, professor, responsável e rede de ensino (ADR 0020). */
@Module({
  imports: [CompaniesModule, NotificationsModule],
  controllers: [SchoolAdminController, TeacherController, GuardianController, MeSchoolController],
  providers: [SchoolAdminService, SchoolReportService, TeacherService, GuardianService, NoticesService],
  exports: [NoticesService],
})
export class SchoolModule {}
