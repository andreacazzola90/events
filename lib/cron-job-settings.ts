import { prisma } from "@/lib/prisma";
import { CRON_JOBS, type CronJobKey } from "./cron-jobs";

export type CronJobSettingState = {
  key: CronJobKey;
  enabled: boolean;
};

export async function getCronJobSettings(): Promise<CronJobSettingState[]> {
  const savedSettings = await prisma.cronJobSetting.findMany({
    select: { jobKey: true, enabled: true },
  });
  const enabledByKey = new Map(
    savedSettings.map((setting) => [setting.jobKey, setting.enabled]),
  );

  return CRON_JOBS.map((job) => ({
    key: job.key,
    enabled: enabledByKey.get(job.key) ?? true,
  }));
}

export async function saveCronJobSettings(enabledKeys: readonly CronJobKey[]): Promise<CronJobSettingState[]> {
  await prisma.$transaction(async (transaction) => {
    for (const job of CRON_JOBS) {
      const enabled = enabledKeys.includes(job.key);
      await transaction.cronJobSetting.upsert({
        where: { jobKey: job.key },
        create: { jobKey: job.key, enabled },
        update: { enabled },
      });
    }
  });
  const enabled = new Set(enabledKeys);
  return CRON_JOBS.map((job) => ({ key: job.key, enabled: enabled.has(job.key) }));
}
