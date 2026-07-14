import { JobStatus } from "../types";

export type FlowRole = "provider" | "employer";

/** ขั้นตอนปัจจุบัน — ใช้ scroll / highlight ร่วมกับ JobDetailFlowStepper */
export type ProviderFlowStepKey = "go" | "arrive" | "photo" | "submit" | "done";
export type EmployerFlowStepKey = "track" | "work" | "review" | "done";

export type JobFlowStepKey = ProviderFlowStepKey | EmployerFlowStepKey;

export interface JobFlowState {
  role: FlowRole;
  stepKey: JobFlowStepKey;
  currentIndex: number;
  stepCount: number;
  subtitle: string;
}

/**
 * Logic เดียวกับ JobDetailFlowStepper — อย่าแยก logic สองที่
 */
export function getJobFlowState(params: {
  role: FlowRole;
  jobStatus: string;
  hasArrived: boolean;
  hasProof: boolean;
  waitingApproval?: boolean;
}): JobFlowState {
  const { role, jobStatus, hasArrived, hasProof, waitingApproval } = params;
  const st = (jobStatus || "").toLowerCase();

  if (role === "provider") {
    const stepsP = [
      { key: "go" as const, label: "เดินทาง" },
      { key: "arrive" as const, label: "ถึงหน้างาน" },
      { key: "photo" as const, label: "รูปหลักฐาน" },
      { key: "submit" as const, label: "ส่งมอบ" },
    ];
    let idx = 0;
    let sub = "เปิดแผนที่แล้วไปหน้างาน";
    let key: ProviderFlowStepKey = "go";

    if (
      st === JobStatus.WAITING_FOR_APPROVAL.toLowerCase() ||
      st === "waiting_for_approval"
    ) {
      idx = stepsP.length;
      key = "done";
      sub = "ส่งมอบแล้ว — รอผู้จ้างตรวจและอนุมัติ";
    } else if (
      st === JobStatus.ACCEPTED.toLowerCase() ||
      st === "accepted"
    ) {
      idx = 0;
      key = "go";
      sub = "เดินทางไปจุดงาน แล้วกดยืนยันเมื่อถึง";
    } else if (
      st === JobStatus.IN_PROGRESS.toLowerCase() ||
      st === "in_progress"
    ) {
      if (!hasArrived) {
        idx = 1;
        key = "arrive";
        sub = "ยืนยันตำแหน่งเมื่อถึงหน้างาน";
      } else if (!hasProof) {
        idx = 2;
        key = "photo";
        sub = "ถ่ายรูปก่อน–หลัง แล้วส่งมอบงาน";
      } else {
        idx = 3;
        key = "submit";
        sub = "ตรวจสอบรายการแล้วกดส่งมอบงาน";
      }
    }

    return {
      role: "provider",
      stepKey: key,
      currentIndex: idx,
      stepCount: stepsP.length,
      subtitle: sub,
    };
  }

  const stepsE = [
    { key: "track" as const, label: "ติดตาม" },
    { key: "work" as const, label: "รอดำเนินงาน" },
    { key: "review" as const, label: "ตรวจรับ" },
  ];
  let idxE = 0;
  let subE = "ดูตำแหน่งผู้รับงานแบบเรียลไทม์";
  let keyE: EmployerFlowStepKey = "track";

  if (
    st === JobStatus.WAITING_FOR_APPROVAL.toLowerCase() ||
    st === "waiting_for_approval"
  ) {
    idxE = 2;
    keyE = "review";
    subE = waitingApproval
      ? "ตรวจรูปและอนุมัติงาน"
      : "รอผู้รับงานส่งมอบ";
  } else if (
    st === JobStatus.IN_PROGRESS.toLowerCase() ||
    st === "in_progress"
  ) {
    idxE = hasProof ? 2 : 1;
    keyE = hasProof ? "review" : "work";
    subE = hasProof
      ? "รอผู้รับงานส่งมอบ — จากนั้นตรวจรับ"
      : "ผู้รับงานกำลังทำงานอยู่";
  } else if (
    st === JobStatus.ACCEPTED.toLowerCase() ||
    st === "accepted"
  ) {
    idxE = 0;
    keyE = "track";
    subE = "รอผู้รับงานเดินทางมาหาคุณ";
  }

  return {
    role: "employer",
    stepKey: keyE,
    currentIndex: idxE,
    stepCount: stepsE.length,
    subtitle: subE,
  };
}
