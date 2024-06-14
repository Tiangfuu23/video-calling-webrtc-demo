import { Component, OnInit, OnDestroy } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { MessageService } from 'primeng/api';
import { IUser } from '../../model/user.model';
import { CallStateService } from '../../shared/app-state/call-state.service';
import { StorageKeys } from '../../shared/constants/constants.class';
import { Router } from '@angular/router';
import { Constant } from '../../shared/constants/constants.class';
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  userInfo: {
    isConnected: boolean;
    username: string;
    userId: number;
  } = {
    isConnected: false,
    username: '',
    userId: -1,
  };
  onlineUserList: IUser[] = [];

  // call
  currentCall : any;
  constructor(
    private supabaseService: SupabaseService,
    private messageService: MessageService,
    private callStateService: CallStateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.unsubscribeOnlineTrackingChannel();
    localStorage.clear();

  }
  ngOnDestroy(): void {}

  async handleLogin() {
    if (this.userInfo.username.trim() === '') {
      this.showErrorToast('Tên không được để trống!');
      return;
    }
    console.log('Initializing');
    const user = await this.supabaseService.createUser(this.userInfo.username);
    console.log(user);
    if (user) {
      this.userInfo.isConnected = true;
      this.userInfo.userId = user.id;
      localStorage.setItem(StorageKeys.USER_INFO, JSON.stringify(this.userInfo));
      this.subscribeOnlineTrackingChannel({
        id: this.userInfo.userId,
        fullname: this.userInfo.username,
      });
      this.subscribeIncomingCall();
    } else {
      this.showErrorToast('Có lỗi xảy ra');
    }
  }



  subscribeOnlineTrackingChannel(user: IUser) {
    this.supabaseService.subscribeOnlineTrackingChannel(user, (state) => {
      console.log(state);
      this.onlineUserList = Object.values(state)
        .map((arr: any) => arr.at(0))
        .filter((u) => u.id !== this.userInfo.userId);
    });
  }

  unsubscribeOnlineTrackingChannel() {
    this.supabaseService.unsubscribeOnlineTrackingChannel();
  }

  showSuccessToast(message: any) {
    this.messageService.add({
      severity: 'success',
      detail: message,
    });
  }

  showErrorToast(message: any) {
    this.messageService.add({
      severity: 'error',
      detail: message,
    });
  }

  async openCall(user: any) {
    this.callStateService.dispatch({
      isCalling: true,
      callerUserId: this.userInfo.userId,
      calleeUserId: user.id
    })

    this.currentCall = await this.supabaseService.createCall({
      callerId: this.userInfo.userId,
      calleeId: user.id
    });
    if(this.currentCall){
      const call_window : Window | null = window.open(`/call/${this.currentCall.id}`, "_blank", "popup");
      const timer = setInterval(() => {
        if(call_window!.closed) {
          console.log("Close");
          this.hangUpCall();
          clearInterval(timer);
        }
      }, 1000);
    }else{
      this.showErrorToast('Có lỗi xảy ra');
    }

    // this.router.navigate(['call']);
  }

  subscribeIncomingCall() {
    const handleIncomingCallCb = async (payload: any) => {
      console.log(payload);
      if (payload?.new?.calleeId === this.userInfo.userId) {
        console.log('You have a call!', payload);
        this.currentCall = payload.new;
        const call_window : Window | null = window.open(`/call/${payload.new.id}`, "_blank", "popup");
        const timer = setInterval(() => {
          if(call_window!.closed) {
            console.log("Close");
            this.hangUpCall();
            clearInterval(timer);
          }
        }, 1000);

        // this.callStateService.dispatch({
        //   isCalling: true,
        //   callId: payload.new.id,
        //   callerUserId: payload.new.callerId,
        //   calleeUserId: this.userInfo.userId
        // });
        // this.router.navigate(['call']);
      }
    };

    this.supabaseService.subscribeIncomingCall(handleIncomingCallCb);
  }

  // Hangup the call
  async hangUpCall(){
    await this.supabaseService.updateCall({
      ...this.currentCall,
      state: Constant.CALL_STATE.close
    })
  }
}
