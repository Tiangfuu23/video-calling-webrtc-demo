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
  // makingOffer: boolean = false;

  // debug
  haveAnswer: boolean = false;
  pendingIceCandidatesInCaller = [];
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
    this.pendingIceCandidatesInCaller = [];
    this.haveAnswer = false;
    this.peerConnection = new RTCPeerConnection(this.configuration);
    this.listenOnConnectionStateChange();
    this.initCamera();
    this.listenOnIceCandidate(true, false);
    this.listenOnNegotiationNeededInCaller();
    this.listenOnRemoteTrack();
  }
  async handleIncomingCall(){
    this.currentCall = await this.supabaseService.getCallById(this.call.callId)
    this.peerConnection = new RTCPeerConnection(this.configuration);
    this.listenOnConnectionStateChange();
    this.initCamera();
    this.listenOnRemoteTrack();
    this.listenOnIceCandidate(false, true);
    this.listenOnNegotiationNeededInCallee();
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
      try {
        // this.makingOffer = true;
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        this.currentCall = await this.supabaseService.createCall({
          callerId: this.call.callerUserId,
          calleeId: this.call.calleeUserId,
          offer: JSON.stringify(offer)
        });
        await this.peerConnection.setLocalDescription(offer);
        console.log('CurrentCall', this.currentCall);
      } catch (err) {
        console.error(err);
      } finally {
        // this.makingOffer = false;
      }
    };
  }

  listenOnNegotiationNeededInCallee() {
    this.peerConnection.onnegotiationneeded = async () => {
      const offer = JSON.parse(this.currentCall.offer);
      await this.peerConnection.setRemoteDescription(offer);
      const answer = await this.peerConnection.createAnswer();
      await this.supabaseService.updateCall({
        ...this.currentCall,
        answer: JSON.stringify(answer),
      });
      await this.peerConnection.setLocalDescription(answer);
    };
  }

  listenOnIceCandidate(isOffering: boolean, isAnswering: boolean) {
    this.peerConnection.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        console.log('Have Candidate', candidate);
        console.log('current call', this.currentCall);
        if(isOffering){
          await this.supabaseService.updateCall({
            ...this.currentCall,
            offerCandidates: candidate,
          });
        }
        if(isAnswering){
          await this.supabaseService.updateCall({
            ...this.currentCall,
            answerCandidates: candidate,
          });
        }
      }
    };
  }

  listenOnRemoteTrack() {
    const remoteVideo: any = document.querySelector('#remoteVideo');
    this.peerConnection.ontrack = async (event) => {
      console.log('Have tracks');
      if(remoteVideo.srcObject){
        console.log("Remote video already contains remote stream!");
        return;
      }
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
      this.currentCall = call;
      if (call.callerId === this.userInfo.userId && call.answer) {
        console.log('Have answer!', call);
        if(!this.haveAnswer){
          this.haveAnswer = true;
          await this.peerConnection.setRemoteDescription(JSON.parse(call.answer));
        }
      }
      // Listen for remote ICE candidates and add them to the local RTCPeerConnection
      if (call.callerId === this.userInfo.userId && call.answerCandidates) {
        console.log('New answer ice Candidate', call);
        await this.peerConnection.addIceCandidate(
          JSON.parse(call.answerCandidates)
        );
      }
      if(call.calleeId === this.userInfo.userId && call.offerCandidates){
        console.log('New offer ice Candidate', call);
        await this.peerConnection.addIceCandidate(
          JSON.parse(call.answerCandidates)
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
