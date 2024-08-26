import { IsBoolean, IsString } from 'class-validator';

export class CreateCronConfigDTO {
  @IsString()
  name: string;

  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  dryRun: boolean;

  @IsString()
  jobType: string;
}
