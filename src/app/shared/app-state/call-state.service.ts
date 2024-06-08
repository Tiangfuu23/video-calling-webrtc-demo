import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { ICall, INIT_CALL } from "../../model/call.model";
@Injectable({
  'providedIn': 'root'
})
export class CallStateService{
  private subject: BehaviorSubject<ICall>;
  private call: ICall;

  constructor() {
    this.call = JSON.parse(JSON.stringify(INIT_CALL));
    this.subject = new BehaviorSubject<ICall>(this.call);
  }
  public getAuthData(callback: (call : ICall) => void) {
    return this.subject.subscribe(callback);
  }
  public dispatch(payload: any | null): void {
    // console.log('dispatched data', payload);
    const data: Partial<ICall> = payload as Partial<ICall>;
    this.call = {...this.call, ...data};
    console.log('new call', this.call);
    const dispatchedModel: ICall = JSON.parse(JSON.stringify(this.call));
    this.subject.next(dispatchedModel);
  }
}
