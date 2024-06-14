import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { MessageService } from 'primeng/api';
import { CallStateService } from '../../shared/app-state/call-state.service';
import { ICall } from '../../model/call.model';
import { StorageKeys, Constant } from '../../shared/constants/constants.class';
import { Router, ActivatedRoute } from '@angular/router';
@Component({
  selector: 'app-call',
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss'
})
export class CallComponent implements OnInit, OnDestroy {
  // call !: ICall
  configuration = {
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302'
        ],
      },
      // {
      //   urls: "stun:stun.relay.metered.ca:80",
      // },
      // {
      //   urls: "turn:global.relay.metered.ca:80",
      //   username: "d94115f03e36380e7a50618d",
      //   credential: "GmAF+cRTk3KpFck4",
      // },
      // {
      //   urls: "turn:global.relay.metered.ca:80?transport=tcp",
      //   username: "d94115f03e36380e7a50618d",
      //   credential: "GmAF+cRTk3KpFck4",
      // },
      // {
      //   urls: "turn:global.relay.metered.ca:443",
      //   username: "d94115f03e36380e7a50618d",
      //   credential: "GmAF+cRTk3KpFck4",
      // },
      // {
      //   urls: "turns:global.relay.metered.ca:443?transport=tcp",
      //   username: "d94115f03e36380e7a50618d",
      //   credential: "GmAF+cRTk3KpFck4",
      // },
    ],
  };
  peerConnection !: RTCPeerConnection;
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
  isCalling : boolean = true;
  haveAnswer: boolean = false;
  haveOffer: boolean = false;
  @ViewChild('localVideo') localVideo: any;
  @ViewChild('remoteVideo') remoteVideo: any;

  // handle collision
  // makingOffer: boolean = false;
  constructor(
    private supabaseService: SupabaseService,
    private messageService: MessageService,
    // private callStateService: CallStateService,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ){

  }

  ngOnInit(): void {
    this.userInfo = JSON.parse(localStorage.getItem(StorageKeys.USER_INFO)!);
    this.initCallEntity();
    // this.callStateService.getAuthData((call) => {
    //   // this.call = call
    //   // if(!call.isCalling) {
    //   //   // this.router.navigate(['/']);
    //   //   return;
    //   // }


    // })
  }

  ngOnDestroy(): void {
    this.hangUpCall();
  }
  async initCallEntity() {
    console.log(this.activatedRoute.snapshot.params)
    const callId = this.activatedRoute.snapshot.params['id'];
    this.currentCall = await this.supabaseService.getCallById(callId);

    this.peerConnection = new RTCPeerConnection(this.configuration);
    this.subscribeCallTable();
    if(this.currentCall.callerId === this.userInfo.userId) {
      this.makeCall();
    }
    else if(this.currentCall.calleeId === this.userInfo.userId){
      this.handleIncomingCall();
    }else{
      this.showErrorToast("Weird!!!!");
    }

  }
  async makeCall() {
    this.haveAnswer = false;
    this.listenOnConnectionStateChange();
    this.initCamera();
    this.listenOnIceCandidate(true, false);
    this.listenOnNegotiationNeededInCaller();
    this.listenOnRemoteTrack();
  }
  async handleIncomingCall(){
    this.haveOffer = false;
    this.listenOnConnectionStateChange();
    // this.initCamera();
    this.listenOnIceCandidate(false, true);
    this.listenOnNegotiationNeededInCallee();
    this.listenOnRemoteTrack();
  }
  async initCamera() {
    try {
      const constraint: MediaStreamConstraints = { video: true, audio: true };
      const stream: MediaStream = await navigator.mediaDevices.getUserMedia(
        constraint
      );
      this.localVideo.nativeElement.srcObject = stream;
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
        this.currentCall = await this.supabaseService.updateCall({
          ...this.currentCall,
          offer: JSON.stringify(offer)
        });
        await this.peerConnection.setLocalDescription(offer); // trigger on ice candidate event
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
      await this.peerConnection.setLocalDescription(answer); // trigger on ice candidate event
    };
  }

  listenOnIceCandidate(isOffering: boolean, isAnswering: boolean) {
    this.peerConnection.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        if(isOffering){
          this.currentCall.offerCandidates.push(candidate)
          await this.supabaseService.updateCall(this.currentCall);
        }
        if(isAnswering){
          this.currentCall.answerCandidates.push(candidate);
          await this.supabaseService.updateCall(this.currentCall);
        }
      }
    };
  }

  listenOnRemoteTrack() {
    this.peerConnection.ontrack = async (event) => {
      console.log('Have tracks');
      // if(remoteVideo.srcObject){
      //   console.log("Remote video already contains remote stream!");
      //   return;
      // }
      this.remoteVideo.nativeElement.srcObject = event.streams[0];
    };
  }

  listenOnConnectionStateChange() {
    this.peerConnection.onconnectionstatechange = (event) => {
      switch(this.peerConnection.connectionState) {
        case 'connected':
          console.log('peer connected');
          break;
        case 'disconnected':
          console.log('Disconnect!');
          break;
        case 'closed':
        case 'failed':
          console.log('close!');
          this.closeVideoCall();
          break;
      }
    }
  }

  subscribeCallTable(){
    const handleUpdateCallCb = async (payload: any) => {
      const call = payload.new;
      this.currentCall = call;
      // console.log('catch an update in call table', this.currentCall);
      if(call.calleeId === this.userInfo.userId && call.offer && !this.haveOffer){
        console.log('Have offer!', call);
        this.haveOffer = true;
        this.initCamera();
      }else if (call.callerId === this.userInfo.userId && call.answer && !this.haveAnswer) {
        console.log('Have answer!', call);
        this.haveAnswer = true;
        await this.peerConnection.setRemoteDescription(JSON.parse(call.answer));
      }else if(call.state === Constant.CALL_STATE.open && call.callerId === this.userInfo.userId && call.answerCandidates){
        // console.log("New answer ice candidate", call.answerCandidates);
        const candidatesList = call.answerCandidates;
        for(let candidate of candidatesList){
          await this.peerConnection.addIceCandidate(JSON.parse(candidate));
        }
      }else if(call.state === Constant.CALL_STATE.open && call.calleeId === this.userInfo.userId && call.offerCandidates){
        // console.log('New offer ice Candidate', call.offerCandidates);
        const candidatesList = call.answerCandidates;
        for(let candidate of candidatesList){
          await this.peerConnection.addIceCandidate(JSON.parse(candidate));
        }
      }

      if(call.state === Constant.CALL_STATE.close){
        this.closeVideoCall();
      }
    };
    this.supabaseService.subscribeCallTable(handleUpdateCallCb);
  }

  // Hangup the call
  async hangUpCall(){
    await this.supabaseService.updateCall({
      ...this.currentCall,
      state: Constant.CALL_STATE.close
    })
  }

  closeVideoCall(){
    this.isCalling = false;
    if(this.peerConnection){
      this.peerConnection.onicecandidate = null,
      this.peerConnection.ontrack = null,
      this.peerConnection.onnegotiationneeded = null;
      this.peerConnection.onconnectionstatechange = null;

      if(this.localVideo.nativeElement.srcObject){
        this.localVideo.nativeElement.srcObject.getTracks().forEach((track: any) => track.stop());
      }

      if(this.remoteVideo.nativeElement.srcObject){
        this.remoteVideo.nativeElement.srcObject.getTracks().forEach((track: any) => track.stop());
      }

      this.remoteVideo.nativeElement.removeAttribute("src");
      this.remoteVideo.nativeElement.removeAttribute("srcObject");
      this.localVideo.nativeElement.removeAttribute("src");
      this.localVideo.nativeElement.removeAttribute("srcObject");


      this.peerConnection.close();
      this.peerConnection = new RTCPeerConnection();
      // this.callStateService.dispatch({
      //   isCalling: false,
      //   callId: -1,
      //   calleeUserId: -1
      // })
    }
  }

  navigateToHome(){
    this.router.navigate(['/']);
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
