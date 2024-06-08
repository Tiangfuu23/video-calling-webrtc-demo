import { Call } from "@angular/compiler";
import { Injectable } from "@angular/core";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { RealtimeChannel } from "@supabase/supabase-js";

const supabaseUrl = 'https://etenjzunfdcrhhauntyz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0ZW5qenVuZmRjcmhoYXVudHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTcyMzE3MTUsImV4cCI6MjAzMjgwNzcxNX0.SdFGtYOyLuTch6R46jaAgTpGHsFyqo8BBadLyG_erV4'

// TABLE
const USER_TABLE = 'User';
const CALL_TABLE = 'Call';

// Channel
const ONLINE_TRACKING_CHANNEL = 'online-tracking';

// interface
interface CallEntity {
  id ?: number,
  callerId: number,
  calleeId: number,
  offer: string,
  answer ?: string,
  iceCandidate ?: string
}
@Injectable({
  'providedIn': 'root'
})
export class SupabaseService {
  supabase : SupabaseClient
  onlineTrackingChannel: RealtimeChannel | null = null;
  constructor(){
    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log(this.supabase);
  }

  async createUser(fullname: string){
    const {data, error} = await this.supabase.from(USER_TABLE).insert({fullname}).select();
    return data ? data[0] : null;
  }

  async getCallById(callId: number){
    const {data} = await this.supabase.from(CALL_TABLE).select().eq('id', callId);

    return data ? data[0] : null
  }

  async createCall(callEntity: CallEntity){
    const {data,error} = await this.supabase.from(CALL_TABLE).insert(callEntity).select();
    return data ? data[0] : null;
  }

  async updateCall(callEntity: CallEntity){
    console.log(callEntity);
    const {data, error} = await this.supabase.from(CALL_TABLE).update(callEntity).eq('id', callEntity.id).select();
    return data ? data[0] : null;
  }

  subscribeOnlineTrackingChannel(user: {id: number, fullname: string}, callback: (presenceState : any) => void){
    this.onlineTrackingChannel = this.supabase.channel(ONLINE_TRACKING_CHANNEL, {
      'config': {
        'presence': {
          key: user.id + ""
        }
      }
    })
    this.onlineTrackingChannel.on('presence', {event: 'sync'}, () => {
      const state = this.onlineTrackingChannel?.presenceState();
      callback(state);
    }).subscribe((status) => {
      if(status === "SUBSCRIBED"){
        this.onlineTrackingChannel?.track(user);
      }
    })
  }
  // subscribe incoming call
  subscribeIncomingCall(handleIncomingCall: (payload:any) => void){
    this.supabase.channel(`public:${CALL_TABLE}`).on('postgres_changes', {event: 'INSERT', schema: 'public', table: CALL_TABLE}, (payload) => {
      handleIncomingCall(payload);
    }).subscribe();
  }
  subscribeCallTable(handleUpdateCall: (payload: any) => void){
    this.supabase.channel(`public:${CALL_TABLE}:call`).on('postgres_changes', {event: 'UPDATE', schema: 'public', table: CALL_TABLE}, (payload) => {
      handleUpdateCall(payload);
    })
    .subscribe();
  }


  unsubscribeOnlineTrackingChannel(){
    this.onlineTrackingChannel?.untrack();
  }
}
