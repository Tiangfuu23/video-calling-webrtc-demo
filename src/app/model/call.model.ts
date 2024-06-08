import { IUser } from "./user.model"

export interface ICall {
  isCalling: boolean,
  callId: number,
  callerUserId : number,
  calleeUserId : number
}

export const INIT_CALL : ICall = {
  isCalling: false,
  callId: -1,
  callerUserId: -1,
  calleeUserId: -1
}
