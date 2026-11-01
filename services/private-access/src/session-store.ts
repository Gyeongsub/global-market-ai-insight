import {GetItemCommand,TransactWriteItemsCommand,UpdateItemCommand,DeleteItemCommand} from "@aws-sdk/client-dynamodb";
import {performance} from "node:perf_hooks";
import {ElapsedBudget} from "../../../shared/time/elapsed-budget.js";
import {OwnerSessionDenied,OWNER_SESSION_LIMITS,type OwnerSessionStore,type AccessRecord,type SessionRecord} from "./owner-session.js";
import {createTicketPlan,readTicketPlan,decodeTicketItem,exchangeTicketPlan,consumeSessionPlan,revokeSessionPlan,decodeSessionItem} from "./session-store-plan.js";

type SessionCommand=GetItemCommand|TransactWriteItemsCommand|UpdateItemCommand|DeleteItemCommand;
export interface SessionDynamoSender {send(command:SessionCommand,options:{abortSignal:AbortSignal}):Promise<unknown>}
const deny=():never=>{throw new OwnerSessionDenied();};
function object(v:unknown):Record<string,unknown>{return v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:deny();}

/** Prepared adapter only: it cannot discover credentials/create a client. A
 * future reviewed runtime must supply a maxAttempts:1 client and narrow auth_*
 * IAM grants. It is not imported by any deployed handler or bundle entrypoint. */
export class DynamoOwnerSessionStore implements OwnerSessionStore {
  constructor(private readonly client:SessionDynamoSender,private readonly owner:string,private readonly origin:string){
    revokeSessionPlan("0".repeat(64),owner,origin); // Validate scope without effects.
  }
  private scope(owner:string,origin:string){if(owner!==this.owner||origin!==this.origin)deny();}
  private async run<T>(parent:AbortSignal,action:(send:(c:SessionCommand)=>Promise<Record<string,unknown>>)=>Promise<T>):Promise<T>{
    const budget=new ElapsedBudget(OWNER_SESSION_LIMITS.storeMs,()=>performance.now(),parent);
    const send=async(c:SessionCommand)=>object(await budget.call(signal=>this.client.send(c,{abortSignal:signal})));
    try{return await action(send)}catch{return deny()}finally{budget.dispose()}
  }
  async createTicket(record:AccessRecord,signal:AbortSignal):Promise<void>{
    this.scope(record.ownerArn,record.origin);const plan=createTicketPlan(record);
    await this.run(signal,async send=>{await send(new TransactWriteItemsCommand(plan));});
  }
  async exchangeTicket(hash:string,owner:string,origin:string,now:number,next:SessionRecord,signal:AbortSignal):Promise<{ticketExpiresAt:number}|null>{
    this.scope(owner,origin);this.scope(next.ownerArn,next.origin);
    // Validate the next record before even reading the ticket. This synthetic
    // baseline is never sent; actual conditional values come from consistent read.
    exchangeTicketPlan({hash,ownerArn:owner,origin,issuedAt:now,expiresAt:now+60},next,now);
    return this.run(signal,async send=>{
      const response=await send(new GetItemCommand(readTicketPlan(hash)));
      if(response.Item===undefined)return null;
      const previous=decodeTicketItem(response.Item,hash,owner,origin,now);
      await send(new TransactWriteItemsCommand(exchangeTicketPlan(previous,next,now)));
      return{ticketExpiresAt:previous.expiresAt};
    });
  }
  async consumeSession(hash:string,owner:string,origin:string,now:number,signal:AbortSignal):Promise<SessionRecord|null>{
    this.scope(owner,origin);const plan=consumeSessionPlan(hash,owner,origin,now);
    return this.run(signal,async send=>{
      const response=await send(new UpdateItemCommand(plan));
      return decodeSessionItem(response.Attributes,hash,owner,origin,now);
    });
  }
  async revokeSession(hash:string,owner:string,origin:string,signal:AbortSignal):Promise<void>{
    this.scope(owner,origin);const plan=revokeSessionPlan(hash,owner,origin);
    await this.run(signal,async send=>{await send(new DeleteItemCommand(plan));});
  }
}
