/* eslint-disable no-inner-declarations */
/* eslint-disable no-var */
import type { Job } from "node-schedule";

declare global {
    var LOUNASBOTTI_JOBS: Record<string, Job>;
    var LOUNASBOTTI_VERSION: string;
}