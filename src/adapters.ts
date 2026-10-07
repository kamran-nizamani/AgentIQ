import type { AgentRun } from "./types.js";
export interface AgentAdapter<TInput=unknown>{ readonly id:string; readonly version:string; normalize(input:TInput):AgentRun; }
export class FunctionAgentAdapter<T> implements AgentAdapter<T>{
  constructor(public readonly id:string,public readonly version:string,private readonly fn:(input:T)=>AgentRun){}
  normalize(input:T):AgentRun{return this.fn(input);}
}
