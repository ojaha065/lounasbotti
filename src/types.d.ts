/* eslint-disable no-var */
import { Job } from "node-schedule";

declare global {
    var LOUNASBOTTI_JOBS: Record<string, Job>;
}