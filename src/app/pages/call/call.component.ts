import { Component, OnInit, OnDestroy } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { MessageService } from 'primeng/api';
import { CallStateService } from '../../shared/app-state/call-state.service';
import { ICall } from '../../model/call.model';
import { StorageKeys } from '../../shared/constants/constants.class';
import { Router } from '@angular/router';
@Component({
  selector: 'app-call',
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss'
})
export class CallComponent implements OnInit, OnDestroy {
  call !: ICall
  configuration = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
    ],
  };
  peerConnection!: RTCPeerConnection;
  currentCall: any;
  userInfo: {
    isConnected: boolean;
    username: string;
    userId: number;
  } = {
    isConnected: false,
    username: '',
    userId: -1,
  };
  constructor(
    private supabaseService: SupabaseService,
    private messageService: MessageService,
    private callStateService: CallStateService,
    private router: Router
  ){

  }

  ngOnInit(): void {
    this.userInfo = JSON.parse(localStorage.getItem(StorageKeys.USER_INFO)!);
    this.callStateService.getAuthData((call) => {
      this.call = call
      // console.log('call', this.call);
      // console.log('user info', this.userInfo);
      if(!call.isCalling) this.router.navigate(['/']);

      this.subscribeCallTable();
      if(call.callerUserId !== -1 && call.callerUserId === this.userInfo.userId) {
        this.makeCall();
      }
      else if(call.calleeUserId !== -1 && call.calleeUserId === this.userInfo.userId){
        this.handleIncomingCall();
      }else{
        this.showErrorToast("Weird!!!!");
      }
    })
  }

  ngOnDestroy(): void {

  }

  async makeCall() {
    this.peerConnection = new RTCPeerConnection(this.configuration);
    this.listenOnIceCandidate();
    this.listenOnConnectionStateChange();
    this.initCamera();
    this.listenOnNegotiationNeededInCaller();
    this.listenOnRemoteTrack();
  }
  async handleIncomingCall(){
    this.currentCall = await this.supabaseService.getCallById(this.call.callId)
    this.peerConnection = new RTCPeerConnection(this.configuration);
    this.listenOnIceCandidate();
    this.listenOnConnectionStateChange();
    this.initCamera();
    this.listenOnRemoteTrack();
    this.listenOnNegotiationNeedInCallee();
  }
  async initCamera() {
    try {
      const constraint: MediaStreamConstraints = { video: true, audio: true };
      const stream: MediaStream = await navigator.mediaDevices.getUserMedia(
        constraint
      );
      const localVideo: any = document.querySelector('#localVideo');
      localVideo.srcObject = stream;
      stream.getTracks().forEach((track: any) => {
        this.peerConnection.addTrack(track, stream);
      });
    } catch (err) {
      console.log(err);
      this.showErrorToast('Có lỗi xảy ra');
    }
  }

  listenOnNegotiationNeededInCaller() {
    this.peerConnection.onnegotiationneeded = async () => {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.peerConnection.setLocalDescription(offer);
      console.log({
        callerId: this.call.callerUserId,
        calleeId: this.call.calleeUserId,
        offer: JSON.stringify(offer),
      });
      this.currentCall = await this.supabaseService.createCall({
        callerId: this.call.callerUserId,
        calleeId: this.call.calleeUserId,
        offer: JSON.stringify(offer),
      });
      console.log('CurrentCall', this.currentCall);
    };
  }

  listenOnNegotiationNeedInCallee() {
    this.peerConnection.onnegotiationneeded = async () => {
      console.log('NegotiationCalleeeee Run!!');
      const offer = JSON.parse(this.currentCall.offer);
      await this.peerConnection.setRemoteDescription(offer);
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      await this.supabaseService.updateCall({
        ...this.currentCall,
        answer: JSON.stringify(answer),
      });
    };
  }

  listenOnIceCandidate() {
    this.peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('Have Candidate', candidate);
        this.supabaseService.updateCall({
          ...this.currentCall,
          iceCandidate: JSON.stringify(candidate),
        });
      }
    };
  }

  listenOnRemoteTrack() {
    console.log('Listen for remote tracks');
    const remoteVideo: any = document.querySelector('#remoteVideo');
    this.peerConnection.ontrack = async (event) => {
      console.log('Have tracks');
      remoteVideo.srcObject = event.streams[0];
    };
  }

  listenOnConnectionStateChange() {
    this.peerConnection.addEventListener('connectionstatechange', (event) => {
      if (this.peerConnection.connectionState === 'connected') {
        console.log('Peer connected');
      }
    });
  }

  subscribeCallTable(){
    const handleUpdateCallCb = async (payload: any) => {
      const call = payload.new;
      if (call.callerId === this.userInfo.userId && call.answer) {
        console.log('Have answer!', call);
        this.peerConnection.setRemoteDescription(JSON.parse(call.answer));
      }
      // Listen for remote ICE candidates and add them to the local RTCPeerConnection
      if (call.iceCandidate) {
        console.log('New ice Candidate', call);
        await this.peerConnection.addIceCandidate(
          JSON.parse(call.iceCandidate)
        );
      }
    };
    this.supabaseService.subscribeCallTable(handleUpdateCallCb);
  }

  // Utility
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
}
