//--------------------------------------------------
// SNES master cycle viewer
//--------------------------------------------------

namespace Utility{
	export class Type{
		private static Modulo(v: number, m: number): number{
			// Floored division
			return ((v % m) + m) % m;
		}

		public static ToByte(v: number): number{
			return this.Modulo(v, (2 ** 8));
		}
		public static ToChar(v: number): number{
			v	= this.ToByte(v);
			if(v >= (2 ** 7)){
				return -(2 ** 8) + v;
			}
			return v;
		}
		public static ToWord(v: number): number{
			return this.Modulo(v, (2 ** 16));
		}
		public static ToShort(v: number): number{
			v	= this.ToWord(v);
			if(v >= (2 ** 15)){
				return -(2 ** 16) + v;
			}
			return v;
		}
		public static ToUint(v: number): number{
			return this.Modulo(v, (2 ** 32));
		}
		public static ToInt(v: number): number{
			v	= this.ToUint(v);
			if(v >= (2 ** 31)){
				return -(2 ** 32) + v;
			}
			return v;
		}
		public static ToLong(v: number): number{
			return this.Modulo(v, (2 ** 24));
		}
	}
	export class Format{
		public static SignChar(v: number): string{
			return (v >= 0)? '+' : '-';
		}
		public static ToHexString(v: number, digit: number = 2): string{
			const s	= '0'.repeat(digit) + v.toString(16);
			return s.substring(s.length - digit).toUpperCase();
		}
		public static PadSpace(str: string, length: number = 0): string{
			const l	= length - str.length;
			const s	= str + ((l > 0)? ' '.repeat(l) : '');
			return s;
		}
		public static PadNumber(v: number, digit: number = 0, padZero: boolean = false): string{
			const p	= (padZero)? '0' : ' ';
			const s	= p.repeat(digit) + v.toString();
			return s.substring(s.length - digit);
		}
	}
	export class Math{
		public static IsRange(v: number, s: number, e: number): boolean{
			return (s <= v) && (v < e);
		}
		public static Saturation(v: number, s: number, e: number): number{
			if(v < s){
				return s;
			}
			if(e < v){
				return e;
			}
			return v;
		}
	}

	export class CharacterReadStream{
		private rawIndex: number	= 0;
		private readEnd: boolean	= true;
		private lastRead: string	= '';

		constructor(
			private allString: string,
			private position: number = 0,
			private LiteralCharacters: string[] = ['\"', '\'', ]
		){
			this.SetPosition(position);
		}

		public ResetPosition(){
			this.rawIndex	= 0;
			this.position	= 0;
			this.readEnd	= false;
			this.lastRead	= '';

			if(this.allString.length <= 0){
				this.readEnd	= true;
			}
		}
		public SetPosition(position: number){
			this.ResetPosition();
			for(let i = 0; i < position; i++){
				this.Read();
			}
		}
		public GetPosition(): number{
			return this.position;
		}
		public ReadEnd(): boolean{
			return this.readEnd;
		}

		public Read(): string | null{
			let output: string		= '';
			let enclosingChar: string | null= null;
			let isEscaping			= false;
			let i: number;

			if(this.readEnd){
				return '';
			}

			for(i = this.rawIndex; i < this.allString.length; i++){
				const c			= this.allString[i];
				const isEncloseChar	= this.LiteralCharacters.includes(c);
				const isEscapeChar	= (c == '\\');

				if(enclosingChar){
					if(isEscaping){
						// end escape
						isEscaping	= false;
						output	+= c;
						continue;
					}
					if(isEscapeChar){
						// start escape
						isEscaping	= true;
						output	+= c;
						continue;
					}
					if(c == enclosingChar){
						// end enclose
						enclosingChar	= null;
						output	+= c;
						i++;
						break;
					}
					output	+= c;
					continue;
				}
				if(isEncloseChar){
					// start enclose
					enclosingChar	= c;
					output	+= c;
					continue;
				}
				output	+= c;
				i++;
				break;
			}

			if(enclosingChar){
				// format error
				return null;
			}

			this.rawIndex	= i;
			this.position++;
			this.readEnd	= (i >= this.allString.length);
			this.lastRead	= output;

			return output;
		}
		public ReadBack(): string{
			let index		= this.position - 1;
			let back		= this.lastRead;

			this.ResetPosition();
			for(let i = 0; i < index; i++){
				this.Read();
			}
			return back;
		}

		public Remaining(): string{
			const clone	= new CharacterReadStream(this.allString, this.position, this.LiteralCharacters);
			let output	= '';
			while(!clone.ReadEnd()){
				output	+= clone.Read();
			}
			return output;
		}
	}
}

//--------------------------------------------------

namespace Emulator{
	export class Cpu{
		public Registers: Registers		= new Registers();
		//private Memory: Memory		= new Memory();
		public MasterCycleCounter: number	= 0;
		public CpuCycleCounter: number		= 0;
		public Logs: StepLog[]			= [];

		public CpuHalted			= false;
		private CpuSlept			= false;

		private PendingRst: boolean		= true;
		private PendingAbt: boolean		= false;
		private PendingNmi: boolean		= false;
		private PendingIrq: boolean		= false;

		private yieldFunction: Generator | null	= null;

		public ResetRegisters: {[key: string]: number} | null	= null;

		public constructor(
			private Memory: Memory
		){
			this.Reset();
		}

		public Boot(){
			this.Registers			= new Registers();
			this.PendingRst			= true;
		}
		public RST(){
			this.PendingRst			= true;
		}
		public ABT(){
			this.PendingRst			= true;
		}
		public NMI(){
			this.PendingRst			= true;
		}
		public IRQ(){
			this.PendingRst			= true;
		}

		public Clock(){
			if(this.PendingRst){
				this.JumpInterruptHandler(InterruptType.EmulationRST);
				this.Reset();	// to override the program counter
				this.PendingRst		= false;
			}
			if(this.CpuHalted){
				return;
			}

			// TODO: Implement interrupts

			// Get next instruction
			if(this.yieldFunction === null){
				this.yieldFunction	= this.ExecuteInstruction();
			}
			const execute	= this.yieldFunction.next();
			if(execute.done){
				this.yieldFunction	= null;
			}
		}
		public Step(){
			do{
				this.Clock();
			}while(this.yieldFunction !== null);
		}

		private Reset(){
			//this.Registers		= new Registers();
			this.MasterCycleCounter		= 0;
			this.CpuCycleCounter		= 0;
			//this.Logs			= [];
			this.CpuHalted			= false;
			this.CpuSlept			= false;
			this.PendingRst			= true;
			this.PendingAbt			= false;
			this.PendingNmi			= false;
			this.PendingIrq			= false;
			this.yieldFunction		= null;

			this.Registers.SetStatusFlagD(false);
			this.Registers.SetStatusFlagI(true);
			this.Registers.SetStatusFlagE(true);

			if(this.ResetRegisters !== null){
				this.Registers.SetRegisters(this.ResetRegisters);
			}
		}

		public GetRegisters(): Registers{
			return this.Registers.Clone();
		}

		private* ExecuteInstruction(){
			const cpu		= this;
			const log		= new StepLog();
			this.Logs.push(log);
			log.MasterCycle		= this.MasterCycleCounter;
			log.CpuCycle		= this.CpuCycleCounter;
			log.Registers		= this.GetRegisters();
			log.InstructionAddress	= this.Registers.GetFullProgramCounter();

			let instructionFunction: Generator[];
			const startPC		= this.Registers.PC;

			const opcode		= this.FetchProgramByte(AccessType.FetchOpcode);
			log.Instruction		= opcode[0].Data;
			log.AccessLog.push(opcode[1]);
			this.CpuCycleCounter++;
			yield;

			// Helper
			//--------------------------------------------------
			function calculateInstructionLength(){
				const endPC	= cpu.Registers.PC;
				const diffPC	= endPC - startPC;
				log.InstructionLength	= diffPC;
			}
			function pushDummyAccess(accessType: AccessType, readAccess: boolean = true, writeAccess: boolean = false){
				// VDA = 0, VPA = 0
				if(readAccess){
					const dummyAccess	= cpu.ReadDataByte(accessType, cpu.Memory.AddressBus);
					log.AccessLog.push({
						AddressBus: cpu.Memory.AddressBus,
						DataBus: cpu.Memory.DataBus,
						Type: accessType,
						Cycle: AccessSpeed.Fast,
					});
				}
				if(writeAccess){
					const dummyAccess	= cpu.WriteDataByte(accessType, cpu.Memory.AddressBus, cpu.Memory.DataBus);
					log.AccessLog.push({
						AddressBus: cpu.Memory.AddressBus,
						DataBus: cpu.Memory.DataBus,
						Type: accessType,
						Cycle: AccessSpeed.Fast,
					});
				}
			}
			function pushPushStack(value: number){
				value		= Utility.Type.ToByte(value);
				const address	= cpu.Registers.S;
				const result	= cpu.WriteDataByte(AccessType.PushStack, address, value);
				cpu.Registers.SetRegisterS(cpu.Registers.S - 1);

				log.AccessLog.push({
					AddressBus: address,
					DataBus: value,
					Type: result[1].Type,
					Cycle: result[1].Cycle,
				});
			}
			function pushPullStack(): number{
				cpu.Registers.SetRegisterS(cpu.Registers.S + 1);
				const address	= cpu.Registers.S;
				const result	= cpu.ReadDataByte(AccessType.PullStack, address);
				const value	= result[0].Data;

				log.AccessLog.push({
					AddressBus: address,
					DataBus: value,
					Type: result[1].Type,
					Cycle: result[1].Cycle,
				});
				return value;
			}
			function updateNZFlag(lengthFlag: boolean, value: number){
				const msbMask	= (lengthFlag)? 0x0080 : 0x8000;
				cpu.Registers.SetStatusFlagN((value & msbMask) !== 0);
				cpu.Registers.SetStatusFlagZ(value === 0);
			}

			// Addressing
			//--------------------------------------------------
			function *AddressingAbsDbr(){								// 01a: abs
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const effectiveAddress		= (cpu.Registers.DB << 16) | operand1;

				log.Addressing			= Addressing.Absolute;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingAbsPbr(waitFlag: boolean){						// 01b, 01c: abs (JMP, JSR)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				if(waitFlag){
					pushDummyAccess(AccessType.ReadDummy);
					yield;
				}

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const effectiveAddress		= (cpu.Registers.PB << 16) | operand1;

				log.Addressing			= Addressing.AbsoluteLong;	// disable memory access
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingAbsRmw(){								// 01d: abs (RMW)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const effectiveAddress		= (cpu.Registers.DB << 16) | operand1;

				const readDataLow		= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
				log.AccessLog.push(readDataLow[1]);
				yield;
				let effectiveValue		= readDataLow[0].Data;
				if(!cpu.Registers.GetStatusFlagM()){
					const readDataHigh	= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
					log.AccessLog.push(readDataHigh[1]);
					effectiveValue		|= (readDataHigh[0].Data << 8);
					yield;
				}

				if(!cpu.Registers.GetStatusFlagE()){
					pushDummyAccess(AccessType.ReadDummy);
				}
				else{
					pushDummyAccess(AccessType.WriteDummy, false, true);
				}
				yield;

				log.Addressing			= Addressing.Absolute;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;
				log.EffectiveValue		= effectiveValue;

				yield* instructionFunction[1];
			}
			function *AddressingLong(){								// 04a, 04b: long
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				yield;

				const operand1Bank		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1Bank[0].Data << 16) | (operand1High[0].Data << 8) | (operand1Low[0].Data);

				log.Addressing			= Addressing.AbsoluteLong;
				log.Operand1			= operand1;
				log.EffectiveAddress		= operand1;

				yield* instructionFunction[1];
			}
			function *AddressingLongJsl(){								// 04c: long (JSL)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				yield;

				pushPushStack(cpu.Registers.PB);
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1Bank		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1Bank[0].Data << 16) | (operand1High[0].Data << 8) | (operand1Low[0].Data);

				log.Addressing			= Addressing.AbsoluteLong;
				log.Operand1			= operand1;
				log.EffectiveAddress		= operand1;

				yield* instructionFunction[1];
			}
			function *AddressingLongIdxX(){								// 05: long, X
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				yield;

				const operand1Bank		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1Bank[0].Data << 16) | (operand1High[0].Data << 8) | (operand1Low[0].Data);

				log.Addressing			= Addressing.AbsoluteLongIndexedX;
				log.Operand1			= operand1;
				log.EffectiveAddress		= operand1;

				yield* instructionFunction[1];
			}
			function *AddressingAbsIdxX(writeAccess: boolean){					// 06a: abs, X
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const baseAddress		= operand1;
				const effectiveAddress		= (cpu.Registers.DB << 16) | ((baseAddress + cpu.Registers.GetRegisterX()) & 0x00FFFF);
				const dummyAddress		= (cpu.Registers.DB << 16) | (baseAddress & 0x00FF00) | (effectiveAddress & 0xFF);

				const basePage			= baseAddress & 0x00FF00;
				const effectivePage		= effectiveAddress & 0x00FF00;
				if((!cpu.Registers.GetStatusFlagX()) || (writeAccess) || (basePage !== effectivePage)){
					if(cpu.Registers.GetStatusFlagE()){
						const penaltyDummy		= cpu.ReadDataByte(AccessType.Penalty, dummyAddress);
						penaltyDummy[1].Cycle		= AccessSpeed.Fast;
						log.AccessLog.push(penaltyDummy[1]);
					}
					else{
						pushDummyAccess(AccessType.Penalty);
					}
					yield;
				}

				log.Addressing			= Addressing.AbsoluteIndexedX;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingAbsIdxXRmw(){							// 06b: abs, X (RMW)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const baseAddress		= operand1;
				const effectiveAddress		= (cpu.Registers.DB << 16) | ((baseAddress + cpu.Registers.GetRegisterX()) & 0x00FFFF);
				const dummyAddress		= (cpu.Registers.DB << 16) | (baseAddress & 0x00FF00) | (effectiveAddress & 0xFF);

				const dummyAccess		= cpu.ReadDataByte(AccessType.ReadDummy, dummyAddress);
				dummyAccess[1].Cycle		= AccessSpeed.Fast;
				log.AccessLog.push(dummyAccess[1]);
				yield;

				const readDataLow		= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
				log.AccessLog.push(readDataLow[1]);
				yield;
				let effectiveValue		= readDataLow[0].Data;
				if(!cpu.Registers.GetStatusFlagM()){
					const readDataHigh	= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
					log.AccessLog.push(readDataHigh[1]);
					effectiveValue		|= (readDataHigh[0].Data << 8);
					yield;
				}

				if(!cpu.Registers.GetStatusFlagE()){
					pushDummyAccess(AccessType.ReadDummy);
				}
				else{
					pushDummyAccess(AccessType.WriteDummy, false, true);
				}
				yield;

				log.Addressing			= Addressing.AbsoluteIndexedY;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;
				log.EffectiveValue		= effectiveValue;

				yield* instructionFunction[1];
			}
			function *AddressingAbsIdxY(writeAccess: boolean){					// 07: abs, Y
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const baseAddress		= operand1;
				const effectiveAddress		= (cpu.Registers.DB << 16) | ((baseAddress + cpu.Registers.GetRegisterY()) & 0x00FFFF);
				const dummyAddress		= (cpu.Registers.DB << 16) | (baseAddress & 0x00FF00) | (effectiveAddress & 0xFF);

				const basePage			= baseAddress & 0x00FF00;
				const effectivePage		= effectiveAddress & 0x00FF00;
				if((!cpu.Registers.GetStatusFlagX()) || (writeAccess) || (basePage !== effectivePage)){
					if(cpu.Registers.GetStatusFlagE()){
						const penaltyDummy		= cpu.ReadDataByte(AccessType.Penalty, dummyAddress);
						penaltyDummy[1].Cycle		= AccessSpeed.Fast;
						log.AccessLog.push(penaltyDummy[1]);
					}
					else{
						pushDummyAccess(AccessType.Penalty);
					}
					yield;
				}

				log.Addressing			= Addressing.AbsoluteIndexedY;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDp(){								// 10a: dp
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}

				const operand1			= operand1Low[0].Data;
				const effectiveAddress		= cpu.Registers.ToDirectAddress(operand1);

				log.Addressing			= Addressing.Directpage;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpRmw(){								// 10b: dp (RMW)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}

				const operand1			= operand1Low[0].Data;
				const effectiveAddress		= cpu.Registers.ToDirectAddress(operand1);

				const readDataLow		= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
				log.AccessLog.push(readDataLow[1]);
				yield;
				let effectiveValue		= readDataLow[0].Data;
				if(!cpu.Registers.GetStatusFlagM()){
					const readDataHigh	= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
					log.AccessLog.push(readDataHigh[1]);
					effectiveValue		|= (readDataHigh[0].Data << 8);
					yield;
				}

				if(!cpu.Registers.GetStatusFlagE()){
					pushDummyAccess(AccessType.ReadDummy);
				}
				else{
					pushDummyAccess(AccessType.WriteDummy, false, true);
				}
				yield;

				log.Addressing			= Addressing.Directpage;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;
				log.EffectiveValue		= effectiveValue;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdxIdrX(){							// 11: (dp, X)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}
				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1			= operand1Low[0].Data;
				const indirectAddress		= cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterX());

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				const effectiveAddress		= (cpu.Registers.DB << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
				yield;

				log.Addressing			= Addressing.DirectpageIndexedIndirectX;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdr(){								// 12: (dp)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}

				const operand1			= operand1Low[0].Data;
				const indirectAddress		= cpu.Registers.ToDirectAddress(operand1);	// TODO: ignore when PEI?

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				const effectiveAddress		= (cpu.Registers.DB << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
				yield;

				log.Addressing			= Addressing.DirectpageIndirect;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdrIdxY(writeAccess: boolean){					// 13: (dp), Y
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}

				const operand1			= operand1Low[0].Data;
				const indirectAddress		= cpu.Registers.ToDirectAddress(operand1);

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				const indirectBaseAddress	= (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
				const effectiveAddress		= (cpu.Registers.DB << 16) | ((indirectBaseAddress +  cpu.Registers.GetRegisterY()) & 0x00FFFF);
				const dummyAddress		= (cpu.Registers.DB << 16) | (indirectBaseAddress & 0x00FF00) | (effectiveAddress & 0xFF);
				yield;

				const basePage			= indirectBaseAddress & 0x00FF00;
				const effectivePage		= effectiveAddress    & 0x00FF00;
				if((!cpu.Registers.GetStatusFlagX()) || (writeAccess) || (basePage !== effectivePage)){
					if(cpu.Registers.GetStatusFlagE()){
						const penaltyDummy		= cpu.ReadDataByte(AccessType.Penalty, dummyAddress);
						penaltyDummy[1].Cycle		= AccessSpeed.Fast;
						log.AccessLog.push(penaltyDummy[1]);
					}
					else{
						pushDummyAccess(AccessType.Penalty);
					}
					yield;
				}

				log.Addressing			= Addressing.DirectpageIndirectIndexedY;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdrLongIdxY(){							// 14: [dp], Y
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}

				const operand1			= operand1Low[0].Data;
				const indirectAddress		= cpu.Registers.ToDirectAddress(operand1);	// TODO: ignore?

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				yield;
				const effectiveAddressBank	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 2);
				log.AccessLog.push(effectiveAddressBank[1]);
				const effectiveAddress		= (effectiveAddressBank[0].Data << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
				yield;

				log.Addressing			= Addressing.DirectpageIndirectLongIndexedY;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdrLong(){							// 15: [dp]
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}

				const operand1			= operand1Low[0].Data;
				const indirectAddress		= cpu.Registers.ToDirectAddress(operand1);	// TODO: ignore?

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				yield;
				const effectiveAddressBank	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 2);
				log.AccessLog.push(effectiveAddressBank[1]);
				const effectiveAddress		= (effectiveAddressBank[0].Data << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
				yield;

				log.Addressing			= Addressing.DirectpageIndirectLong;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdxX(){								// 16a: dp, X
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}
				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1			= operand1Low[0].Data;
				const effectiveAddress		= cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterX());

				log.Addressing			= Addressing.DirectpageIndexedX;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingDpIdxXRmw(){							// 16b: dp, X (RMW)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.IsZeroDRegisterLow()){
					pushDummyAccess(AccessType.Penalty);
					yield;
				}
				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1			= operand1Low[0].Data;
				const effectiveAddress		= cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterX());

				const readDataLow		= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
				log.AccessLog.push(readDataLow[1]);
				yield;
				let effectiveValue		= readDataLow[0].Data;
				if(!cpu.Registers.GetStatusFlagM()){
					const readDataHigh	= cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
					log.AccessLog.push(readDataHigh[1]);
					effectiveValue		|= (readDataHigh[0].Data << 8);
					yield;
				}

				if(!cpu.Registers.GetStatusFlagE()){
					pushDummyAccess(AccessType.ReadDummy);
				}
				else{
					pushDummyAccess(AccessType.WriteDummy, false, true);
				}
				yield;

				log.Addressing			= Addressing.DirectpageIndexedX;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;
				log.EffectiveValue		= effectiveValue;

				yield* instructionFunction[1];
			}
			function *AddressingImmediate(addressing: Addressing, lengthFlag: boolean){		// 18: #imm
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				let operand1			= operand1Low[0].Data;
				if(!lengthFlag){
					const operand1High	= cpu.FetchProgramByte(AccessType.FetchOperand);
					operand1		|= (operand1High[0].Data << 8);
					log.AccessLog.push(operand1High[1]);
					yield;
				}
				calculateInstructionLength();

				log.Addressing			= addressing;
				log.Operand1			= operand1;

				yield* instructionFunction[1];
			}
			function *AddressingImmediateImm8(){							// 18a: #imm8
				yield* AddressingImmediate(Addressing.Immediate8, true);
			}
			function *AddressingImmediateMemory(){							// 18b: #immM
				yield* AddressingImmediate(Addressing.ImmediateMemory, cpu.Registers.GetStatusFlagM());
			}
			function *AddressingImmediateIndex(){							// 18c: #immX
				yield* AddressingImmediate(Addressing.ImmediateIndex, cpu.Registers.GetStatusFlagX());
			}
			function *AddressingImplied(additionalWait: boolean = false){				// 19: Impl
				calculateInstructionLength();

				pushDummyAccess(AccessType.ReadDummy);

				if(additionalWait){
					yield;
					pushDummyAccess(AccessType.ReadDummy);
				}

				log.Addressing			= Addressing.Implied;

				yield* instructionFunction[1];
			}
			function *AddressingRel(){								// 20: rel
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();

				const operand1			= Utility.Type.ToChar(operand1Low[0].Data);
				const effectiveAddress		= cpu.Registers.ToRelativeAddress(operand1);

				log.Addressing			= Addressing.Relative;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingStackPull(lengthFlag: boolean){					// 22b: S (PLA, PLB, PLD, PLP, PLX, PLY)
				calculateInstructionLength();

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const stackPointer	= cpu.Registers.S;
				const stackLow		= pushPullStack();
				let effectiveValue	= stackLow;
				if(!lengthFlag){
					yield;
					const stackHigh	= pushPullStack();
					effectiveValue	|= (stackHigh << 8);
				}

				log.Addressing			= Addressing.Stack;
				log.EffectiveAddress		= stackPointer;
				log.EffectiveValue		= effectiveValue;

				yield* instructionFunction[1];
			}
			function *AddressingStackPush(value: number, lengthFlag: boolean){			// 22c: S (PHA, PHB, PHP, PHD, PHK, PHX, PHY)
				const stackPointer		= cpu.Registers.S;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				if(!lengthFlag){
					pushPushStack(value >> 8);
					yield;
				}

				pushPushStack(value);

				log.Addressing			= Addressing.Stack;
				log.EffectiveAddress		= stackPointer;
				log.EffectiveValue		= value;

				yield* instructionFunction[1];
			}
			function *AddressingStackInterrupt(emulationMask: number){				// 22j: S (BRK, COP)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				if(!cpu.Registers.GetStatusFlagE()){
					pushPushStack(cpu.Registers.PB);
					yield;
				}

				const stackPointer		= cpu.Registers.S;
				pushPushStack(cpu.Registers.PC >> 8);
				yield;

				pushPushStack(cpu.Registers.PC);
				yield;

				let statusRegister		= cpu.Registers.P;
				if(cpu.Registers.GetStatusFlagE()){
					// for BRK
					statusRegister		|= emulationMask;
				}
				pushPushStack(statusRegister);
				yield;

				log.Addressing			= Addressing.Immediate8;	// show signature
				log.Operand1			= operand1Low[0].Data;
				log.EffectiveAddress		= stackPointer;
				log.EffectiveValue		= operand1Low[0].Data;

				yield* instructionFunction[1];
			}
			function *AddressingStackRel(){								// 23: sr, S
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const effectiveAddress		= cpu.Registers.S + operand1Low[0].Data;

				log.Addressing			= Addressing.StackRelative;
				log.Operand1			= operand1Low[0].Data;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingStackRelIdrIdxY(){							// 23: (sr, S), Y
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				calculateInstructionLength();
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1			= operand1Low[0].Data;
				const indirectAddress		= cpu.Registers.S + operand1;

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const effectiveAddressPage	= (effectiveAddressHigh[0].Data << 8) | (effectiveAddressLow[0].Data) + cpu.Registers.GetRegisterY();
				const effectiveAddress		= (cpu.Registers.DB << 16) + Utility.Type.ToWord(effectiveAddressPage);

				log.Addressing			= Addressing.StackRelativeIndirectIndexedY;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}

			// Instruction
			//--------------------------------------------------
			function *InstructionDummy(instruction: Instruction){
				log.Instruction		= instruction;
			}

			function *InstructionBranch(instruction: Instruction, branch: boolean){
				log.Instruction			= instruction;
				if(!branch){
					log.EffectiveValue	= cpu.Registers.GetFullProgramCounter();
					return;
				}

				yield;
				pushDummyAccess(AccessType.ReadDummy);

				const destinationAddress	= log.EffectiveAddress;
				if(cpu.Registers.GetStatusFlagE()){
					const beforePage	= cpu.Registers.GetFullProgramCounter() & 0x00FF00;
					const destinationPage	= destinationAddress & 0x00FF00;
					if(beforePage !== destinationPage){
						yield;
						pushDummyAccess(AccessType.Penalty);
					}
				}

				cpu.Registers.SetFullProgramCounter(destinationAddress);
				log.EffectiveValue		= destinationAddress;
			}
			function *InstructionClearFlag(instruction: Instruction, mask: number){
				log.Instruction			= instruction;

				const andMask			= Utility.Type.ToByte(~mask);
				const effectiveValue		= cpu.Registers.P & andMask;
				cpu.Registers.SetRegisterP(effectiveValue);
			}
			function *InstructionInterrupt(nativeInterrupt: InterruptType, emulationInterrupt: InterruptType){
				const fetchVector		= (cpu.Registers.E)? emulationInterrupt : nativeInterrupt;
				const addressLow		= cpu.ReadDataByte(AccessType.ReadIndirect, fetchVector + 0);
				log.AccessLog.push(addressLow[1]);
				yield;

				const addressHigh		= cpu.ReadDataByte(AccessType.ReadIndirect, fetchVector + 1);
				log.AccessLog.push(addressHigh[1]);

				const address			= (addressHigh[0].Data << 8) | (addressLow[0].Data)

				cpu.Registers.SetFullProgramCounter(address);
				cpu.Registers.SetStatusFlagD(false);
				cpu.Registers.SetStatusFlagI(true);

				log.IndirectAddress	= fetchVector;
			}
			function *InstructionSetFlag(instruction: Instruction, mask: number){
				log.Instruction			= instruction;

				const effectiveValue		= cpu.Registers.P | Utility.Type.ToByte(mask);
				cpu.Registers.SetRegisterP(effectiveValue);
			}
			function *InstructionSetRegister(instruction: Instruction, destination: string){
				log.Instruction			= instruction;

				cpu.Registers.SetRegisters({[destination]: log.EffectiveValue});
			}
			function *InstructionTxx(instruction: Instruction, sourceValue: number, destination: string){
				log.Instruction			= instruction;

				cpu.Registers.SetRegisters({[destination]: sourceValue});
			}

			function *InstructionAND(imm: boolean = false){
				let effectiveValue		= cpu.Registers.GetRegisterA();
				let readValue			= 0;

				if(imm){
					readValue		= log.Operand1;
				}
				else{
					const readValueLow		= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
					log.AccessLog.push(readValueLow[1]);
					readValue			= readValueLow[0].Data;

					if(!cpu.Registers.GetStatusFlagM()){
						yield;
						const readValueHigh	= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
						log.AccessLog.push(readValueHigh[1]);
						readValue		|= (readValueHigh[0].Data << 8);
					}
				}

				effectiveValue		&= readValue;
				cpu.Registers.SetRegisterA(effectiveValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);

				log.Instruction		= Instruction.AND;
				log.EffectiveValue	= readValue;
			}
			function *InstructionASLRegister(carry: boolean){
				const effectiveValue	= cpu.Registers.GetRegisterA();
				const intCarry		= (carry)? 1 : 0;
				let writeValue		= ((effectiveValue << 1) | intCarry) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);
				cpu.Registers.SetStatusFlagC((effectiveValue & cpu.Registers.GetMsbMaskM()) !== 0);

				cpu.Registers.SetRegisterA(writeValue);

				log.Instruction		= Instruction.ASL;
			}
			function *InstructionASLMemory(carry: boolean){
				const effectiveAddress	= log.EffectiveAddress;
				const effectiveValue	= log.EffectiveValue;
				const intCarry		= (carry)? 1 : 0;
				let writeValue		= ((effectiveValue << 1) | intCarry) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);
				cpu.Registers.SetStatusFlagC((effectiveValue & cpu.Registers.GetMsbMaskM()) !== 0);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction		= Instruction.ASL;
			}
			function *InstructionBIT(){
				let readValue			= 0;

				const readValueLow		= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
				log.AccessLog.push(readValueLow[1]);
				readValue			= readValueLow[0].Data;

				if(!cpu.Registers.GetStatusFlagM()){
					yield;
					const readValueHigh	= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
					log.AccessLog.push(readValueHigh[1]);
					readValue		|= (readValueHigh[0].Data << 8);
				}

				const result		= readValue & cpu.Registers.GetRegisterA();

				const nMask		= cpu.Registers.GetMsbMaskM();
				const vMask		= nMask >> 1;

				cpu.Registers.SetStatusFlagN((readValue & nMask) !== 0);
				cpu.Registers.SetStatusFlagV((readValue & vMask) !== 0);
				cpu.Registers.SetStatusFlagZ(result === 0);

				log.Instruction		= Instruction.BIT;
				log.EffectiveValue	= readValue;
			}
			function *InstructionBRK(){
				log.Instruction		= Instruction.BRK;
				yield* InstructionInterrupt(InterruptType.NativeBRK, InterruptType.EmulationIRQ);
			}
			function *InstructionCOP(){
				log.Instruction		= Instruction.COP;
				yield* InstructionInterrupt(InterruptType.NativeCOP, InterruptType.EmulationCOP);
			}
			function *InstructionDECRegister(){
				const effectiveValue	= cpu.Registers.GetRegisterA();
				let writeValue		= (effectiveValue - 1) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);

				cpu.Registers.SetRegisterA(writeValue);

				log.Instruction		= Instruction.DEC;
			}
			function *InstructionDECMemory(){
				const effectiveAddress	= log.EffectiveAddress;
				const effectiveValue	= log.EffectiveValue;
				let writeValue		= (effectiveValue - 1) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction		= Instruction.DEC;
			}
			function *InstructionINCRegister(){
				const effectiveValue	= cpu.Registers.GetRegisterA();
				let writeValue		= (effectiveValue + 1) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);

				cpu.Registers.SetRegisterA(writeValue);

				log.Instruction		= Instruction.INC;
			}
			function *InstructionINCMemory(){
				const effectiveAddress	= log.EffectiveAddress;
				const effectiveValue	= log.EffectiveValue;
				let writeValue		= (effectiveValue + 1) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction		= Instruction.INC;
			}
			function *InstructionJSR(instruction: Instruction, addressMask: number){
				const jumpAddress	= log.Operand1 & addressMask;
				const pushValue		= cpu.Registers.PC;

				pushPushStack(pushValue >> 8);
				yield;

				pushPushStack(pushValue);

				cpu.Registers.SetProgramCounter(jumpAddress);

				log.Instruction		= instruction;
			}
			function *InstructionORA(imm: boolean = false){
				let effectiveValue		= cpu.Registers.GetRegisterA();
				let readValue			= 0;

				if(imm){
					readValue		= log.Operand1;
				}
				else{
					const readValueLow		= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
					log.AccessLog.push(readValueLow[1]);
					readValue			= readValueLow[0].Data;

					if(!cpu.Registers.GetStatusFlagM()){
						yield;
						const readValueHigh	= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
						log.AccessLog.push(readValueHigh[1]);
						readValue		|= (readValueHigh[0].Data << 8);
					}
				}

				effectiveValue		|= readValue;
				cpu.Registers.SetRegisterA(effectiveValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);

				log.Instruction		= Instruction.ORA;
				log.EffectiveValue	= readValue;
			}
			function *InstructionTRB(){
				const effectiveAddress	= log.EffectiveAddress;
				const effectiveValue	= log.EffectiveValue;
				let writeValue		= cpu.Registers.GetRegisterA();
				cpu.Registers.SetStatusFlagZ((writeValue & effectiveValue) === 0);
				writeValue		= effectiveValue & Utility.Type.ToWord(~writeValue);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction		= Instruction.TRB;
			}
			function *InstructionTSB(){
				const effectiveAddress	= log.EffectiveAddress;
				const effectiveValue	= log.EffectiveValue;
				let writeValue		= cpu.Registers.GetRegisterA();
				cpu.Registers.SetStatusFlagZ((writeValue & effectiveValue) === 0);
				writeValue		|= effectiveValue;

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction		= Instruction.TSB;
			}

			const InstructionTable: Generator[][]	= [
				[AddressingStackInterrupt(0x30 /* nvRBdizc */),		InstructionBRK()							],	// 00: BRK #imm8
				[AddressingDpIdxIdrX(),					InstructionORA()							],	// 01: ORA (dp, X)
				[AddressingStackInterrupt(0x20 /* nvRbdizc */),		InstructionCOP()							],	// 02: COP #imm8
				[AddressingStackRel(),					InstructionORA()							],	// 03: ORA sr, S
				[AddressingDpRmw(),					InstructionTSB()							],	// 04: TSB dp
				[AddressingDp(),					InstructionORA()							],	// 05: ORA dp
				[AddressingDpRmw(),					InstructionASLMemory(false)						],	// 06: ASL dp
				[AddressingDpIdrLong(),					InstructionORA()							],	// 07: ORA [dp]
				[AddressingStackPush(cpu.Registers.P, true),		InstructionDummy(Instruction.PHP)					],	// 08: PHP S
				[AddressingImmediateMemory(),				InstructionORA(true)							],	// 09: ORA #immM
				[AddressingImplied(),					InstructionASLRegister(false)						],	// 0A: ASL A
				[AddressingStackPush(cpu.Registers.D, false),		InstructionDummy(Instruction.PHD)					],	// 0B: PHD S
				[AddressingAbsRmw(),					InstructionTSB()							],	// 0C: TSB abs
				[AddressingAbsDbr(),					InstructionORA()							],	// 0D: ORA abs
				[AddressingAbsRmw(),					InstructionASLMemory(false)						],	// 0E: ASL abs
				[AddressingLong(),					InstructionORA()							],	// 0F: ORA long
				[AddressingRel(),					InstructionBranch(Instruction.BPL, !cpu.Registers.GetStatusFlagN())	],	// 10: BPL rel
				[AddressingDpIdrIdxY(false),				InstructionORA()							],	// 11: ORA (dp), Y
				[AddressingDpIdr(),					InstructionORA()							],	// 12: ORA (dp)
				[AddressingStackRelIdrIdxY(),				InstructionORA()							],	// 13: ORA (sr, S), Y
				[AddressingDpRmw(),					InstructionTRB()							],	// 14: TRB dp
				[AddressingDpIdxX(),					InstructionORA()							],	// 15: ORA dp, X
				[AddressingDpIdxXRmw(),					InstructionASLMemory(false)						],	// 16: ASL dp, X
				[AddressingDpIdrLongIdxY(),				InstructionORA()							],	// 17: ORA [dp], Y
				[AddressingImplied(),					InstructionClearFlag(Instruction.CLC, 0x01 /* nvmxdizC */)		],	// 18: CLC
				[AddressingAbsIdxY(false),				InstructionORA()							],	// 19: ORA abs, Y
				[AddressingImplied(),					InstructionINCRegister()						],	// 1A: INC A
				[AddressingImplied(),					InstructionTxx(Instruction.TCS, cpu.Registers.GetRegisterA(true), 'S')	],	// 1B: TCS
				[AddressingAbsRmw(),					InstructionTRB()							],	// 1C: TRB abs
				[AddressingAbsIdxX(false),				InstructionORA()							],	// 1D: ORA abs, X
				[AddressingAbsIdxXRmw(),				InstructionASLMemory(false)						],	// 1E: ASL abs, X
				[AddressingLongIdxX(),					InstructionORA()							],	// 1F: ORA long, X
				[AddressingAbsPbr(true),				InstructionJSR(Instruction.JSR, 0x00FFFF)				],	// 20: JSR abs
				[AddressingDpIdxIdrX(),					InstructionAND()							],	// 21: AND (dp, X)
				[AddressingLongJsl(),					InstructionJSR(Instruction.JSL, 0xFFFFFF)				],	// 22: JSL long
				[AddressingStackRel(),					InstructionAND()							],	// 23: AND sr, S
				[AddressingDp(),					InstructionBIT()							],	// 24: BIT dp
				[AddressingDp(),					InstructionAND()							],	// 25: AND dp
				[AddressingDpRmw(),					InstructionASLMemory(cpu.Registers.GetStatusFlagC())			],	// 26: ROL dp
				[AddressingDpIdrLong(),					InstructionAND()							],	// 27: AND [dp]
				[AddressingStackPull(true),				InstructionSetRegister(Instruction.PLP, 'P')				],	// 28: PLP S
				[AddressingImmediateMemory(),				InstructionAND(true)							],	// 29: AND #immM
				[AddressingImplied(),					InstructionASLRegister(cpu.Registers.GetStatusFlagC())			],	// 2A: ROL A
				[AddressingStackPull(false),				InstructionSetRegister(Instruction.PLD, 'D')				],	// 2B: PLD S
				[AddressingAbsDbr(),					InstructionBIT()							],	// 2C: BIT abs
				[AddressingAbsDbr(),					InstructionAND()							],	// 2D: AND abs
				[AddressingAbsRmw(),					InstructionASLMemory(cpu.Registers.GetStatusFlagC())			],	// 2E: ROL abs
				[AddressingLong(),					InstructionAND()							],	// 2F: AND long
				[AddressingRel(),					InstructionBranch(Instruction.BMI, cpu.Registers.GetStatusFlagN())	],	// 30: BMI rel
				[AddressingDpIdrIdxY(false),				InstructionAND()							],	// 31: AND (dp), Y
				[AddressingDpIdr(),					InstructionAND()							],	// 32: AND (dp)
				[AddressingStackRelIdrIdxY(),				InstructionAND()							],	// 33: AND (sr, S), Y
				[AddressingDpRmw(),					InstructionBIT()							],	// 34: BIT dp
				[AddressingDpIdxX(),					InstructionAND()							],	// 35: AND dp, X
				[AddressingDpIdxXRmw(),					InstructionASLMemory(cpu.Registers.GetStatusFlagC())			],	// 36: ROL dp, X
				[AddressingDpIdrLongIdxY(),				InstructionAND()							],	// 37: AND [dp], Y
				[AddressingImplied(),					InstructionSetFlag(Instruction.SEC, 0x01 /* nvmxdizC */)		],	// 38: SEC
				[AddressingAbsIdxY(false),				InstructionAND()							],	// 39: AND abs, Y
				[AddressingImplied(),					InstructionDECRegister()						],	// 3A: DEC A
				[AddressingImplied(),					InstructionTxx(Instruction.TSC, cpu.Registers.S, 'C')			],	// 3B: TSC
				[AddressingAbsRmw(),					InstructionBIT()							],	// 3C: BIT abs
				[AddressingAbsIdxX(false),				InstructionAND()							],	// 3D: AND abs, X
				[AddressingAbsIdxXRmw(),				InstructionASLMemory(cpu.Registers.GetStatusFlagC())			],	// 3E: ROL abs, X
				[AddressingLongIdxX(),					InstructionAND()							],	// 3F: AND long, X
			];

			instructionFunction	= InstructionTable[opcode[0].Data];
			if(!instructionFunction){
				console.log(`[ERROR] Unimplemented instruction $${Utility.Format.ToHexString(startPC, 6)}: $${Utility.Format.ToHexString(opcode[0].Data, 2)}`);
				return;
			}

			let execute: IteratorResult<unknown, any>;
			do{
				execute	= instructionFunction[0].next();
				this.CpuCycleCounter++;
				if(execute.done){
					break;
				}
				yield;
			}while(!execute.done)

			this.MasterCycleCounter	+= log.GetExecuteMasterCycle();
		}

		private JumpInterruptHandler(interrupt: InterruptType){
			const readAddress	= interrupt as number;
			const address		=
				(this.Memory.ReadByte(readAddress    ).Data     ) |
				(this.Memory.ReadByte(readAddress + 1).Data << 8)
			;
			this.Registers.SetFullProgramCounter(address);
		}

		private IncrementProgramCounter(){
			const address	= this.Registers.GetFullProgramCounter();
			this.Registers.SetProgramCounter(address + 1);
		}
		private FetchProgramByte(accessType: AccessType, incrementPC: boolean = true): [MemoryReadResult, AccessLog] {
			const address	= this.Registers.GetFullProgramCounter();
			const access	= this.Memory.ReadByte(address);

			if(incrementPC){
				this.IncrementProgramCounter();
			}

			return [access, {
				AddressBus: address,
				DataBus: access.Data,
				Type: accessType,
				Cycle: access.Speed,
			}];
		}
		private ReadDataByte(accessType: AccessType, address: number): [MemoryReadResult, AccessLog] {
			const access	= this.Memory.ReadByte(address);

			return [access, {
				AddressBus: address,
				DataBus: access.Data,
				Type: accessType,
				Cycle: access.Speed,
			}];
		}
		private WriteDataByte(accessType: AccessType, address: number, value: number): [MemoryWriteResult, AccessLog] {
			const access	= this.Memory.WriteByte(address, value);

			return [access, {
				AddressBus: address,
				DataBus: value,
				Type: accessType,
				Cycle: access.Speed,
			}];
		}

	}

	export class Registers{
		A: number	= 0;
		X: number	= 0;
		Y: number	= 0;
		S: number	= 0x01FF;
		PC: number	= 0;
		P: number	= 0x34;	// nvRBdIzc
		D: number	= 0;
		PB: number	= 0;
		DB: number	= 0;
		E: boolean	= true;
		MDR: number	= 0;

		public SetRegisters(dict: {[register: string]: number}){
			if(dict['E'] !== undefined){
				this.E	= !!dict['E'];
			}
			for(const key in dict){
				const value	= dict[key.toUpperCase()];
				switch(key){
					case 'A':	this.SetRegisterA(value);	break;
					case 'X':	this.SetRegisterX(value);	break;
					case 'Y':	this.SetRegisterY(value);	break;
					case 'S':	this.SetRegisterS(value);	break;
					case 'PC':	this.PC	= value;		break;
					case 'P':	this.SetRegisterP(value);	break;
					case 'D':	this.D	= value;		break;
					case 'PB':	this.PB	= value;		break;
					case 'DB':	this.DB	= value;		break;

					case 'C':	this.SetRegisterA(value, true);	break;
					//case 'XX':	this.SetRegisterX(value, true);	break;
					//case 'YX':	this.SetRegisterY(value, true);	break;
				}
			}
		}
		public Clone(): Registers{
			const clone	= new Registers();
			clone.A		= this.A;
			clone.X		= this.X;
			clone.Y		= this.Y;
			clone.S		= this.S;
			clone.PC	= this.PC;
			clone.P		= this.P;
			clone.D		= this.D;
			clone.PB	= this.PB;
			clone.DB	= this.DB;
			clone.E		= this.E;
			clone.MDR	= this.MDR;

			return clone;
		}

		public ToString(): string{
			const strA	= Utility.Format.ToHexString(this.A, 4);
			const strX	= Utility.Format.ToHexString(this.X, 4);
			const strY	= Utility.Format.ToHexString(this.Y, 4);
			const strS	= Utility.Format.ToHexString(this.S, 4);
			const strPC	= Utility.Format.ToHexString(this.PB, 2) + Utility.Format.ToHexString(this.PC, 4);
			const strP	= Utility.Format.ToHexString(this.P, 2);
			const strD	= Utility.Format.ToHexString(this.D, 4);
			const strDB	= Utility.Format.ToHexString(this.DB, 2);
			return `PC=${strPC},`
				+ `A=${strA},X=${strX},Y=${strY},S=${strS},`
				+ `P=${strP} ${this.ToStringStatus()},`
				+ `D=${strD},DB=${strDB}`;
		}
		public ToStringStatus(): string{
			const emulationStatus	= 'nvrbdizcE';
			const nativeStatus	= 'nvmxdizce';
			const baseStatus	= (this.E)? emulationStatus : nativeStatus;

			let status		= '';
			for(let i = 0; i < 8; i++){
				const bit	= (this.P & (1 << (7 - i))) != 0;
				const c		= baseStatus[i];
				status		+= (bit)? c.toUpperCase() : c.toLowerCase();
			}
			status		+= baseStatus[8];
			return status;
		}

		public GetStatusFlagN(): boolean{
			return ((this.P >> 7) & 1) != 0;
		}
		public GetStatusFlagV(): boolean{
			return ((this.P >> 6) & 1) != 0;
		}
		public GetStatusFlagM(): boolean{
			if(this.GetStatusFlagE()){
				return true;
			}
			return ((this.P >> 5) & 1) != 0;
		}
		public GetStatusFlagX(): boolean{
			if(this.GetStatusFlagE()){
				return true;
			}
			return ((this.P >> 4) & 1) != 0;
		}
		public GetStatusFlagD(): boolean{
			return ((this.P >> 3) & 1) != 0;
		}
		public GetStatusFlagI(): boolean{
			return ((this.P >> 2) & 1) != 0;
		}
		public GetStatusFlagZ(): boolean{
			return ((this.P >> 1) & 1) != 0;
		}
		public GetStatusFlagC(): boolean{
			return ((this.P >> 0) & 1) != 0;
		}
		public GetStatusFlagE(): boolean{
			return this.E;
		}
		public SetStatusFlagN(b: boolean){
			this.SetStatusFlag(b, 7);
		}
		public SetStatusFlagV(b: boolean){
			this.SetStatusFlag(b, 6);
		}
		public SetStatusFlagM(b: boolean, forceUpdate: boolean = false){
			if((!this.GetStatusFlagE()) || forceUpdate){
				this.SetStatusFlag(b, 5);
			}
		}
		public SetStatusFlagX(b: boolean, forceUpdate: boolean = false){
			if((!this.GetStatusFlagE()) || forceUpdate){
				this.SetStatusFlag(b, 4);
			}
		}
		public SetStatusFlagD(b: boolean){
			this.SetStatusFlag(b, 3);
		}
		public SetStatusFlagI(b: boolean){
			this.SetStatusFlag(b, 2);
		}
		public SetStatusFlagZ(b: boolean){
			this.SetStatusFlag(b, 1);
		}
		public SetStatusFlagC(b: boolean){
			this.SetStatusFlag(b, 0);
		}
		public SetStatusFlagE(b: boolean) {
			this.E	= b;
			this.ToEmulationMode();
		}
		private SetStatusFlag(b: boolean, n: number){
			const m	= 1 << n;
			let p	= (this.P & (0xFF ^ m)) | ((b)? m : 0);
			this.SetRegisterP(p);
		}
		public SetRegisterP(p: number){
			this.P	= Utility.Type.ToByte(p);
			this.ToEmulationMode();
		}
		public SwapStatusFlagCE(){
			// swap C, E flags
			let e	= (this.P & 1) != 0;
			this.SetStatusFlagC(this.E);
			this.E	= e;

			this.ToEmulationMode();
		}
		private ToEmulationMode(){
			if(!this.GetStatusFlagE()){
				return;
			}

			// to emulation mode

			// set MX(RB) flags
			this.P	|= 0x30;

			// clear index registers high byte
			this.X	&= 0x00FF;
			this.Y	&= 0x00FF;

			// set stack pointer high byte
			this.S	= (this.S & 0x00FF) | 0x0100;
		}

		public GetRegisterA(forceFull: boolean = false): number{
			if(this.GetStatusFlagM() && (!forceFull)){
				return Utility.Type.ToByte(this.A);
			}
			else{
				return Utility.Type.ToWord(this.A);
			}
		}
		public GetRegisterX(forceFull: boolean = false): number{
			if(this.GetStatusFlagX() && (!forceFull)){
				return Utility.Type.ToByte(this.X);
			}
			else{
				return Utility.Type.ToWord(this.X);
			}
		}
		public GetRegisterY(forceFull: boolean = false): number{
			if(this.GetStatusFlagX() && (!forceFull)){
				return Utility.Type.ToByte(this.Y);
			}
			else{
				return Utility.Type.ToWord(this.Y);
			}
		}
		public SetRegisterA(value: number, forceFull: boolean = false){
			if(this.GetStatusFlagM() && (!forceFull)){
				this.A	= (this.A & 0xFF00) | Utility.Type.ToByte(value);
			}
			else{
				this.A	= Utility.Type.ToWord(value);
			}
		}
		public SetRegisterX(value: number, forceFull: boolean = false){
			if(this.GetStatusFlagX() && (!forceFull)){
				this.X	= Utility.Type.ToByte(value);
			}
			else{
				this.X	= Utility.Type.ToWord(value);
			}
		}
		public SetRegisterY(value: number, forceFull: boolean = false){
			if(this.GetStatusFlagX() && (!forceFull)){
				this.Y	= Utility.Type.ToByte(value);
			}
			else{
				this.Y	= Utility.Type.ToWord(value);
			}
		}
		public SetRegisterS(value: number){
			if(this.GetStatusFlagE()){
				this.S	= Utility.Type.ToWord(0x0100 | (value & 0x00FF));
			}
			else{
				this.S	= Utility.Type.ToWord(value);
			}
		}

		public GetMaskM(): number{
			return (this.GetStatusFlagM())? 0x00FF : 0xFFFF;
		}
		public GetMaskX(): number{
			return (this.GetStatusFlagX())? 0x00FF : 0xFFFF;
		}
		public GetMsbMaskM(): number{
			return (this.GetStatusFlagM())? 0x0080 : 0x8000;
		}
		public GetMsbMaskX(): number{
			return (this.GetStatusFlagX())? 0x0080 : 0x8000;
		}

		public GetRegisterStringA(value: number = this.A): string{
			let digit	= (this.GetStatusFlagM())? 2 : 4;
			return Utility.Format.ToHexString(value, digit);
		}
		public GetRegisterStringX(value: number = this.X): string{
			let digit	= (this.GetStatusFlagX())? 2 : 4;
			return Utility.Format.ToHexString(value, digit);
		}
		public GetRegisterStringY(value: number = this.Y): string{
			let digit	= (this.GetStatusFlagX())? 2 : 4;
			return Utility.Format.ToHexString(value, digit);
		}

		public SetFullProgramCounter(value: number){
			this.PB	= Utility.Type.ToByte(value >> 16);
			this.PC	= Utility.Type.ToWord(value);
		}
		public SetProgramCounter(value: number){
			value	= Utility.Type.ToWord(value);
			this.PC	= value;
		}
		public GetFullProgramCounter(): number{
			return this.ToRelativeAddress(0);
		}
		public ToDirectAddress(address: number): number{
			// see also: W65C816S Datasheet 7.2 Direct Addressing
			// TODO: > except for [Direct] and [Direct],Y addressing modes and the PEI instruction which will increment from 0000FE or 0000FF
			return this.D + (address & this.GetOperandMask());
		}
		public ToDataAddress(address: number){
			return this.DB + Utility.Type.ToWord(address);
		}
		public ToRelativeAddress(offset: number): number{
			return (this.PB << 16) + Utility.Type.ToWord(this.PC + offset);
		}

		public IsZeroDRegisterLow(): boolean{
			return Utility.Type.ToByte(this.D) == 0;
		}
		public GetOperandMask(): number{
			return (this.GetStatusFlagE() && this.IsZeroDRegisterLow())? 0x00FF : 0xFFFF;
		}
	};

	export class Memory{
		private AddressSpace: {[Address: number]: number}	= {};
		ROMMapping: ROMMapping	= ROMMapping.LoROM;
		IsFastROM: boolean	= false;

		AddressBus: number	= 0;
		DataBus: number		= 0;

		public ReadByte(address: number): MemoryReadResult{
			const [region, realAddress]	= this.ToRealAddress(address);
			let data			= this.HookIORead(realAddress);
			if(data === null){
				if(region !== AccessRegion.OpenBus){
					data		= this.AddressSpace[realAddress] ?? 0;
				}
				else{
					data		= this.DataBus;
				}
			}
			data	= Utility.Type.ToByte(data);

			const speed		= this.UpdateBus(address, data);
			const result: MemoryReadResult	= {
				Region: region,
				Data: data,
				Speed: speed,
			};
			return result;
		}

		public WriteByte(address: number, data: number, romWrite: boolean = false): MemoryWriteResult{
			const [region, realAddress]	= this.ToRealAddress(address);
			if(!this.HookIOWrite(realAddress)){
				if((region !== AccessRegion.ROM) || romWrite){
					this.AddressSpace[realAddress]	= Utility.Type.ToByte(data);
				}
			}

			const speed		= this.UpdateBus(address, data);
			const result: MemoryWriteResult	= {
				Region: region,
				Speed: speed,
			};
			return result;
		}

		private ToRealAddress(address: number): [AccessRegion, number]{
			const bank	= Utility.Type.ToByte(address >> 16);
			const page	= Utility.Type.ToWord(address);

			if(Utility.Math.IsRange(bank, 0x7E, 0x80)){
				// Main RAM
				return [AccessRegion.MainRAM, address];
			}
			else if((address & 0x40E000) === 0x000000){
				// mirrored RAM
				address	= 0x7E0000 | (address & 0x001FFF);
				return [AccessRegion.MainRAM, address];
			}
			else if(((bank & 0x40) === 0) && Utility.Math.IsRange(page, 0x2000, 0x6000)){
				// I/O registers
				address	= (address & 0x007FFF);
				return [AccessRegion.IO, address];
			}

			if(this.ROMMapping === ROMMapping.LoROM){
				if(((bank & 0x40) === 0) && Utility.Math.IsRange(page, 0x6000, 0x8000)){
					// Open bus
					return [AccessRegion.OpenBus, address];
				}
				else if(Utility.Math.IsRange(bank, 0x70, 0x7E) && (page < 0x8000)){
					// SRAM
					// move to $F0-$FF
					address	= (address | 0x800000);
					return [AccessRegion.StaticRAM, address];
				}
				else{
					// ROM
					// move to $80-$FF bank, $8000-$FFFF page
					address	= (address | 0x808000);
					return [AccessRegion.ROM, address];
				}
			}
			else if(this.ROMMapping === ROMMapping.HiROM){
				if(Utility.Math.IsRange(bank & 0x7F, 0x00, 0x10) && Utility.Math.IsRange(page, 0x6000, 0x8000)){
					// Open bus
					// $00-0F,80-8F:6000-7FFF
					// Since there are multiple variants, only the common part is open bus
					// https://problemkaputt.de/fullsnes.htm#snescarthirommappingromdividedinto64kbanksaround500games
					return [AccessRegion.OpenBus, address];
				}
				else if(Utility.Math.IsRange(bank & 0x7F, 0x00, 0x40) && Utility.Math.IsRange(page, 0x6000, 0x8000)){
					// SRAM
					// move to $30-$3F
					address	= (address | 0x300000) & 0x3FFFFF;
					return [AccessRegion.StaticRAM, address];
				}
				else{
					// ROM
					// move to $C0-$FF bank
					address	= (address | 0xC00000);
					return [AccessRegion.ROM, address];
				}
			}

			return [AccessRegion.ROM, address];
		}

		private HookIORead(address: number): number | null{
			switch(address){
				case 0x002100:
					// TODO: Implements
					break;
			}
			return null;
		}
		/**
		 * @returns memory hooked (true = I/O / false = memory)
		 */
		private HookIOWrite(address: number): boolean{
			switch(address){
				case 0x002100:
					// TODO: Implements
					return true;
			}
			return false;
		}

		private UpdateBus(address: number, data: number): AccessSpeed{
			// Reference:
			// 	https://wiki.superfamicom.org/memory-mapping

			address		= Utility.Type.ToLong(address);
			data		= Utility.Type.ToByte(data);

			let speed	= (this.IsFastROM)? AccessSpeed.Fast : AccessSpeed.Slow;

			const bank	= address >> 16;
			const page	= address & 0x00FFFF;
			if(bank <= 0x3F){
				if(     page <= 0x1FFF){ speed	= AccessSpeed.Slow;	}	// $00-3F:0000-1FFF
				else if(page <= 0x20FF){ speed	= AccessSpeed.Fast;	}	// $00-3F:2000-20FF
				else if(page <= 0x21FF){ speed	= AccessSpeed.Fast;	}	// $00-3F:2100-21FF
				else if(page <= 0x3FFF){ speed	= AccessSpeed.Fast;	}	// $00-3F:2200-3FFF
				else if(page <= 0x41FF){ speed	= AccessSpeed.XSlow;	}	// $00-3F:4000-41FF
				else if(page <= 0x43FF){ speed	= AccessSpeed.Fast;	}	// $00-3F:4200-43FF
				else if(page <= 0x5FFF){ speed	= AccessSpeed.Fast;	}	// $00-3F:4400-5FFF
				else if(page <= 0x7FFF){ speed	= AccessSpeed.Slow;	}	// $00-3F:6000-7FFF
				else if(page <= 0xFFFF){ speed	= AccessSpeed.Slow;	}	// $00-3F:8000-FFFF
			}
			else if(bank <= 0x7D){
				speed	= AccessSpeed.Slow;					// $40-7D:0000-FFFF
			}
			else if(bank <= 0x7F){
				speed	= AccessSpeed.Slow;					// $7E-7F:0000-FFFF
			}
			else if(bank <= 0xBF){
				if(     page <= 0x1FFF){ speed	= AccessSpeed.Slow;	}	// $80-BF:0000-1FFF
				else if(page <= 0x20FF){ speed	= AccessSpeed.Fast;	}	// $80-BF:2000-20FF
				else if(page <= 0x21FF){ speed	= AccessSpeed.Fast;	}	// $80-BF:2100-21FF
				else if(page <= 0x3FFF){ speed	= AccessSpeed.Fast;	}	// $80-BF:2200-3FFF
				else if(page <= 0x41FF){ speed	= AccessSpeed.XSlow;	}	// $80-BF:4000-41FF
				else if(page <= 0x43FF){ speed	= AccessSpeed.Fast;	}	// $80-BF:4200-43FF
				else if(page <= 0x5FFF){ speed	= AccessSpeed.Fast;	}	// $80-BF:4400-5FFF
				else if(page <= 0x7FFF){ speed	= AccessSpeed.Slow;	}	// $80-BF:6000-7FFF
				else if(page <= 0xFFFF){ /* MEMSEL: Fast or Slow */	}	// $80-BF:8000-FFFF
			}
			else if(bank <= 0xFF){
				/* MEMSEL: Fast or Slow */					// $C0-FF:0000-FFFF
			}

			// update bus
			// TODO: Emulate PPU1, 2 MDR
			this.AddressBus	= address;
			this.DataBus	= data;

			return speed;
		}
	}

	export enum Addressing{
		Implied,				// imp
		Accumulator,				// A
		Stack,					// S
		Immediate8,				// #imm8
		ImmediateMemory,			// #immM
		ImmediateIndex,				// #immX
		Directpage,				// dp
		DirectpageIndexedX,			// dp,X
		DirectpageIndexedY,			// dp,Y
		DirectpageIndirect,			// (dp)
		DirectpageIndexedIndirectX,		// (dp,X)
		DirectpageIndirectIndexedY,		// (dp),Y
		DirectpageIndirectLong,			// [dp]
		DirectpageIndirectLongIndexedY,		// [dp],Y
		Absolute,				// abs
		AbsoluteIndexedX,			// abs,X
		AbsoluteIndexedY,			// abs,Y
		AbsoluteIndirect,			// (abs)
		AbsoluteIndexedIndirect,		// (abs,X)
		AbsoluteIndirectLong,			// [abs]
		AbsoluteLong,				// long
		AbsoluteLongIndexedX,			// long,X
		Relative,				// rel
		RelativeLong,				// rlong
		StackRelative,				// sr,S
		StackRelativeIndirectIndexedY,		// (sr,S),Y
		BlockMove,				// xyc
	}
	export enum Instruction{
		ADC, AND, ASL, BCC, BCS, BEQ, BIT, BMI, BNE, BPL,
		BRA, BRK, BRL, BVC, BVS, CLC, CLD, CLI, CLV, CMP,
		COP, CPX, CPY, DEC, DEX, DEY, EOR, INC, INX, INY,
		JML, JMP, JSL, JSR, LDA, LDX, LDY, LSR, MVN, MVP,
		NOP, ORA, PEA, PEI, PER, PHA, PHB, PHD, PHK, PHP,
		PHX, PHY, PLA, PLB, PLD, PLP, PLX, PLY, REP, ROL,
		ROR, RTI, RTL, RTS, SBC, SEC, SED, SEI, SEP, STA,
		STP, STX, STY, STZ, TAX, TAY, TCD, TCS, TDC, TRB,
		TSB, TSC, TSX, TXA, TXS, TXY, TYA, TYX, WAI, WDM,
		XBA, XCE,
	}
	const InstructionLength: number[]	= [
		1 + 0,	// Instruction.Implied
		1 + 0,	// Instruction.Accumulator
		1 + 0,	// Instruction.Stack
		1 + 1,	// Instruction.Immediate8
		1 + 1,	// Instruction.ImmediateMemory
		1 + 1,	// Instruction.ImmediateIndex
		1 + 1,	// Instruction.Directpage
		1 + 1,	// Instruction.DirectpageIndexedX
		1 + 1,	// Instruction.DirectpageIndexedY
		1 + 1,	// Instruction.DirectpageIndirect
		1 + 1,	// Instruction.DirectpageIndexedIndirectX
		1 + 1,	// Instruction.DirectpageIndirectIndexedY
		1 + 1,	// Instruction.DirectpageIndirectLong
		1 + 1,	// Instruction.DirectpageIndirectLongIndexedY
		1 + 2,	// Instruction.Absolute
		1 + 2,	// Instruction.AbsoluteIndexedX
		1 + 2,	// Instruction.AbsoluteIndexedY
		1 + 2,	// Instruction.AbsoluteIndirect
		1 + 2,	// Instruction.AbsoluteIndexedIndirect
		1 + 2,	// Instruction.AbsoluteIndirectLong
		1 + 3,	// Instruction.AbsoluteLong
		1 + 3,	// Instruction.AbsoluteLongIndexedX
		1 + 1,	// Instruction.Relative
		1 + 2,	// Instruction.RelativeLong
		1 + 1,	// Instruction.StackRelative
		1 + 1,	// Instruction.StackRelativeIndirectIndexedY
		1 + 2,	// Instruction.BlockMove
	];
	export const InstructionTable: {[Instruction: string]: (number | null)[]}	= {
	//     Mnemonic  imp         S           #immM       dp          dp,Y        (dp,X)      [dp]        abs         abs,Y       (abs,X)     long        rel         sr,S        xyc    	   Flags
	//                     A           #imm8       #immX       dp,X        (dp)        (dp),Y      [dp],Y      abs,X       (abs)       [abs]       long,X      rlong       (sr,S),Y
		'ADC': [ null, null, null, null, 0x69, null, 0x65, 0x75, null, 0x72, 0x61, 0x71, 0x67, 0x77, 0x6D, 0x7D, 0x79, null, null, null, 0x6F, 0x7F, null, null, 0x63, 0x73, null ],	// NV----ZC
		'AND': [ null, null, null, null, 0x29, null, 0x25, 0x35, null, 0x32, 0x21, 0x31, 0x27, 0x37, 0x2D, 0x3D, 0x39, null, null, null, 0x2F, 0x3F, null, null, 0x23, 0x33, null ],	// N-----Z-
		'ASL': [ null, 0x0A, null, null, null, null, 0x06, 0x16, null, null, null, null, null, null, 0x0E, 0x1E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		'BCC': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null ],	// --------
		'BCS': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null ],	// --------
		'BEQ': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF0, null, null, null, null ],	// --------
	//	'BGE': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null ],	// --------
		'BIT': [ null, null, null, null, 0x89, null, 0x24, 0x34, null, null, null, null, null, null, 0x2C, 0x3C, null, null, null, null, null, null, null, null, null, null, null ],	// NV----Z- / #imm : ------Z-
	//	'BLT': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null ],	// --------
		'BMI': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x30, null, null, null, null ],	// --------
		'BNE': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xD0, null, null, null, null ],	// --------
		'BPL': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x10, null, null, null, null ],	// --------
		'BRA': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x80, null, null, null, null ],	// --------
	//	'BRK': [ null, null, 0x00, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'BRK': [ null, null, null, 0x00, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'BRL': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x82, null, null, null ],	// --------
		'BVC': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x50, null, null, null, null ],	// --------
		'BVS': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x70, null, null, null, null ],	// --------
		'CLC': [ 0x18, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C
		'CLD': [ 0xD8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----D---
		'CLI': [ 0x58, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -----I--
		'CLV': [ 0xB8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -V------
	//	'CMA': [ null, null, null, null, 0xC9, null, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null ],	// N-----ZC
		'CMP': [ null, null, null, null, 0xC9, null, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null ],	// N-----ZC
	//	'COP': [ null, null, 0x02, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'COP': [ null, null, null, 0x02, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'CPX': [ null, null, null, null, null, 0xE0, 0xE4, null, null, null, null, null, null, null, 0xEC, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		'CPY': [ null, null, null, null, null, 0xC0, 0xC4, null, null, null, null, null, null, null, 0xCC, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
	//	'DEA': [ null, 0x3A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'DEC': [ null, 0x3A, null, null, null, null, 0xC6, 0xD6, null, null, null, null, null, null, 0xCE, 0xDE, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'DEX': [ 0xCA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'DEY': [ 0x88, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'EOR': [ null, null, null, null, 0x49, null, 0x45, 0x55, null, 0x52, 0x41, 0x51, 0x47, 0x57, 0x4D, 0x5D, 0x59, null, null, null, 0x4F, 0x5F, null, null, 0x43, 0x53, null ],	// N-----Z-
	//	'INA': [ null, 0x1A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'INC': [ null, 0x1A, null, null, null, null, 0xE6, 0xF6, null, null, null, null, null, null, 0xEE, 0xFE, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'INX': [ 0xE8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'INY': [ 0xC8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'JML': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xDC, 0x5C, null, null, null, null, null, null ],	// --------
	//	'JMP': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, 0x6C, 0x7C, 0xDC, 0x5C, null, null, null, null, null, null ],	// --------
		'JMP': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, 0x6C, 0x7C, null, null, null, null, null, null, null, null ],	// --------
		'JSL': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x22, null, null, null, null, null, null ],	// --------
	//	'JSR': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, 0xFC, null, 0x22, null, null, null, null, null, null ],	// --------
		'JSR': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, 0xFC, null, null, null, null, null, null, null, null ],	// --------
		'LDA': [ null, null, null, null, 0xA9, null, 0xA5, 0xB5, null, 0xB2, 0xA1, 0xB1, 0xA7, 0xB7, 0xAD, 0xBD, 0xB9, null, null, null, 0xAF, 0xBF, null, null, 0xA3, 0xB3, null ],	// N-----Z-
		'LDX': [ null, null, null, null, null, 0xA2, 0xA6, null, 0xB6, null, null, null, null, null, 0xAE, null, 0xBE, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'LDY': [ null, null, null, null, null, 0xA0, 0xA4, 0xB4, null, null, null, null, null, null, 0xAC, 0xBC, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'LSR': [ null, 0x4A, null, null, null, null, 0x46, 0x56, null, null, null, null, null, null, 0x4E, 0x5E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		'MVN': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x54 ],	// --------
		'MVP': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x44 ],	// --------
		'NOP': [ 0xEA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'ORA': [ null, null, null, null, 0x09, null, 0x05, 0x15, null, 0x12, 0x01, 0x11, 0x07, 0x17, 0x0D, 0x1D, 0x19, null, null, null, 0x0F, 0x1F, null, null, 0x03, 0x13, null ],	// N-----Z-
		'PEA': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF4, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PEI': [ null, null, null, null, null, null, null, null, null, 0xD4, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PER': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x62, null, null, null ],	// --------
		'PHA': [ null, null, 0x48, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHB': [ null, null, 0x8B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHD': [ null, null, 0x0B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHK': [ null, null, 0x4B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHP': [ null, null, 0x08, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHX': [ null, null, 0xDA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHY': [ null, null, 0x5A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PLA': [ null, null, 0x68, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLB': [ null, null, 0xAB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLD': [ null, null, 0x2B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLP': [ null, null, 0x28, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'PLX': [ null, null, 0xFA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLY': [ null, null, 0x7A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'REP': [ null, null, null, 0xC2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'ROL': [ null, 0x2A, null, null, null, null, 0x26, 0x36, null, null, null, null, null, null, 0x2E, 0x3E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'ROR': [ null, 0x6A, null, null, null, null, 0x66, 0x76, null, null, null, null, null, null, 0x6E, 0x7E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'RTI': [ null, null, 0x40, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'RTL': [ null, null, 0x6B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'RTS': [ null, null, 0x60, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'SBC': [ null, null, null, null, 0xE9, null, 0xE5, 0xF5, null, 0xF2, 0xE1, 0xF1, 0xE7, 0xF7, 0xED, 0xFD, 0xF9, null, null, null, 0xEF, 0xFF, null, null, 0xE3, 0xF3, null ],	// N-----ZC
		'SEC': [ 0x38, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C
		'SED': [ 0xF8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----D---
		'SEI': [ 0x78, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -----I--
		'SEP': [ null, null, null, 0xE2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'STA': [ null, null, null, null, null, null, 0x85, 0x95, null, 0x92, 0x81, 0x91, 0x87, 0x97, 0x8D, 0x9D, 0x99, null, null, null, 0x8F, 0x9F, null, null, 0x83, 0x93, null ],	// --------
		'STP': [ 0xDB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'STX': [ null, null, null, null, null, null, 0x86, null, 0x96, null, null, null, null, null, 0x8E, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'STY': [ null, null, null, null, null, null, 0x84, 0x94, null, null, null, null, null, null, 0x8C, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'STZ': [ null, null, null, null, null, null, 0x64, 0x74, null, null, null, null, null, null, 0x9C, 0x9E, null, null, null, null, null, null, null, null, null, null, null ],	// --------
	//	'SWA': [ 0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
	//	'TAD': [ 0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
	//	'TAS': [ 0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'TAX': [ 0xAA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TAY': [ 0xA8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TCD': [ 0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TCS': [ 0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
	//	'TDA': [ 0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TDC': [ 0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TRB': [ null, null, null, null, null, null, 0x14, null, null, null, null, null, null, null, 0x1C, null, null, null, null, null, null, null, null, null, null, null, null ],	// ------Z-
		'TSB': [ null, null, null, null, null, null, 0x04, null, null, null, null, null, null, null, 0x0C, null, null, null, null, null, null, null, null, null, null, null, null ],	// ------Z-
	//	'TSA': [ 0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TSC': [ 0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TSX': [ 0xBA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TXA': [ 0x8A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TXS': [ 0x9A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'TXY': [ 0x9B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TYA': [ 0x98, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TYX': [ 0xBB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'WAI': [ 0xCB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'WDM': [ 0x42, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'XBA': [ 0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'XCE': [ 0xFB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C (C=E, E=C)
	};

	export function GetInstructionLength(addressing: Addressing, flagM: boolean, flagX: boolean): number {
		let additionalLength	= 0;
		switch(addressing){
			case Addressing.ImmediateMemory:
				additionalLength	= (flagM)? 0 : 1;
				break;
			case Addressing.ImmediateIndex:
				additionalLength	= (flagX)? 0 : 1;
				break;
		}
		return InstructionLength[addressing] + additionalLength;
	}

	export class StepLog{
		Instruction: Instruction	= Instruction.NOP;	// Initial: NOP ($EA)
		Addressing: Addressing		= Addressing.Implied;
		Opcode: number | null		= InstructionTable[Emulator.Instruction[this.Instruction]][this.Addressing];
		Operand1: number		= 0;
		Operand2: number		= 0;
		InstructionAddress: number	= 0;
		IndirectAddress: number		= 0;
		EffectiveAddress: number	= 0;
		EffectiveValue: number		= 0;
		MasterCycle: number		= 0;
		CpuCycle: number		= 0;
		InstructionLength: number	= 0;
		SourceLineNumber: number	= -1;
		Registers: Registers		= new Registers();
		AccessLog: AccessLog[]		= [];

		public GetLogString(): string{
			return `${Instruction[this.Instruction]} `
				+ `${Utility.Format.PadSpace(this.GetFormattedOperand(), 40)}`
				+ ` ; ${this.Registers.ToString()},C-CYC=${this.CpuCycle},M-CYC=${this.MasterCycle}`;
		}
		protected GetFormattedOperand(): string{
			const strOpr1M		= this.Registers.GetRegisterStringA(this.Operand1);
			const strOpr1X		= this.Registers.GetRegisterStringX(this.Operand1);
			const strOpr1B		= Utility.Format.ToHexString(this.Operand1, 2);
			const strOpr1W		= Utility.Format.ToHexString(this.Operand1, 4);
			const strOpr1L		= Utility.Format.ToHexString(this.Operand1, 6);
			const strOpr2B		= Utility.Format.ToHexString(this.Operand2, 2);
			const strIndAddr	= Utility.Format.ToHexString(this.IndirectAddress, 6);
			const strEffAddr	= Utility.Format.ToHexString(this.EffectiveAddress, 6);
			const strEffValM	= this.Registers.GetRegisterStringA(this.EffectiveValue);
			const strLngAccess	= `$${strEffAddr} => $${strEffValM}`;
			const strIndAccess	= `$${strIndAddr} > $${strEffAddr} => $${strEffValM}`;
			const strOprRel		= Utility.Format.SignChar(this.Operand1) + Math.abs(this.Operand1).toString();
			const strRelDst		= Utility.Format.ToHexString(this.EffectiveAddress, 4);
			const strXycDst		= '$' + strOpr1B + Utility.Format.ToHexString(this.Registers.Y, 4);
			const strXycSrc		= '$' + strOpr2B + Utility.Format.ToHexString(this.Registers.X, 4);
			return [
				``,								// imp
				`A`,								// A
				``,								// S
				`#$${strOpr1B}`,						// #imm8
				`#$${strOpr1M}`,						// #immM
				`#$${strOpr1X}`,						// #immX
				`$${strOpr1B} @ ${strLngAccess}`,				// dp
				`$${strOpr1B}, X @ ${strLngAccess}`,				// dp,X
				`$${strOpr1B}, Y @ ${strLngAccess}`,				// dp,Y
				`($${strOpr1B}) @ ${strIndAccess}`,				// (dp)
				`($${strOpr1B}, X) @ ${strIndAccess}`,				// (dp,X)
				`($${strOpr1B}), Y @ ${strIndAccess}`,				// (dp),Y
				`[$${strOpr1B}] @ ${strIndAccess}`,				// [dp]
				`[$${strOpr1B}], Y @ ${strIndAccess}`,				// [dp],Y
				`$${strOpr1W} @ ${strLngAccess}`,				// abs
				`$${strOpr1W}, X @ ${strLngAccess}`,				// abs,X
				`$${strOpr1W}, Y @ ${strLngAccess}`,				// abs,Y
				`($${strOpr1W}) @ ${strIndAccess}`,				// (abs)
				`($${strOpr1W}, X) @ ${strIndAccess}`,				// (abs,X)
				`[$${strOpr1W}] @ ${strIndAccess}`,				// [abs]
				`$${strOpr1L}`,							// long
				`$${strOpr1L}, X @ ${strLngAccess}`,				// long,X
				`$${strRelDst} @ ${strOprRel}`,					// rel
				`$${strRelDst} @ ${strOprRel}`,					// rlong
				`$${strOpr1B}, S @ ${strLngAccess}`,				// sr,S
				`($${strOpr1B}, S), Y @ ${strIndAccess}`,			// (sr,S),Y
				`$${strOpr2B}, $${strOpr1B} @ ${strXycDst} <- ${strXycSrc}`,	// xyc	; src, dst
			][this.Addressing];
		}

		public GetExecuteMasterCycle(): number{
			let cycle	= 0;
			for(let i = 0; i < this.AccessLog.length; i++){
				cycle	+= this.AccessLog[i].Cycle;
			}
			return cycle;
		}
		public GetExecuteCpuCycle(): number{
			return this.AccessLog.length;
		}
	}

	export type AccessLog	= {
		AddressBus: number;
		DataBus: number;
		Type: AccessType;
		Cycle: AccessSpeed;
	};
	export enum AccessType{
		FetchOpcode,
		FetchOperand,
		ReadIndirect,
		Read,
		Write,
		ReadDummy,
		WriteDummy,
		PullStack,
		PushStack,
		Penalty,
	}
	export enum AccessSpeed{
		Fast	= 6,
		Slow	= 8,
		XSlow	= 12,
	}
	export enum ROMMapping{
		LoROM,
		HiROM,
		// ExLoROM,
		// ExHiROM,
	}
	export enum AccessRegion{
		ROM,
		MainRAM,
		StaticRAM,
		IO,
		OpenBus,
	}
	type MemoryReadResult = {
		Region: AccessRegion;
		Data: number;	// byte
		Speed: AccessSpeed;
	}
	type MemoryWriteResult = {
		Region: AccessRegion;
		Speed: AccessSpeed;
	}

	enum InterruptType{
		NativeReserved0		= 0x00FFE0,
		NativeReserved2		= 0x00FFE2,
		NativeCOP		= 0x00FFE4,
		NativeBRK		= 0x00FFE6,
		NativeABT		= 0x00FFE8,
		NativeNMI		= 0x00FFEA,
		NativeReservedC		= 0x00FFEC,
		NativeIRQ		= 0x00FFEE,
		EmulationReserved0	= 0x00FFF0,
		EmulationReserved2	= 0x00FFF2,
		EmulationCOP		= 0x00FFF4,
		EmulationReserved6	= 0x00FFF6,
		EmulationABT		= 0x00FFF8,
		EmulationNMI		= 0x00FFFA,
		EmulationRST		= 0x00FFFC,
		EmulationIRQ		= 0x00FFFE,
	}

}

//--------------------------------------------------

namespace Assembler{
	export class Assembler{
		private Chunks: DataChunk[]				= [];

		private Tokens: Token[]					= [];

		private LabelList: { [Label: string]: ScopeItem}	= {};
		private PlusLabelList: number[]				= [];
		private MinusLabelList: number[]			= [];
		private DefineList: { [Define: string]: DefineItem }	= {};

		private NowScopeName: string				= '';
		private NowAddress: number				= 0;
		private NowDirectPage: number				= 0;
		/** true = 8 bit / false = 16 bit */
		private NowMemoryLength: boolean			= true;
		/** true = 8 bit / false = 16 bit */
		private NowIndexLength: boolean				= true;

		private ErrorMessages: ErrorMessage[]			= [];

		private StartAddress: number				= 0x008000;

		/** true = Output log to console / false = Do not output log */
		public static Verbose: boolean				= false;

		public static Assemble(code: string, startAddress: number = 0x008000): [DataChunk[] | null, ErrorMessage[]]{
			const lex		= new Assembler();
			lex.StartAddress	= startAddress;

			const sectionLog	= (str: string) => {
				console.log('%c' + (`----- ${str} ` + '-'.repeat(50)).substring(0, 50), 'background-color: silver');
			}
			const passStart		= (pass: number) => {
				if(Assembler.Verbose){
					sectionLog(`Pass ${pass}`);
				}
				lex.ResetLexicalStatus();
			}
			const passFinish	= () => {
				if(Assembler.Verbose){
					lex.DumpTokens();
				}
			}
			const dumpChunk		= () => {
				if(Assembler.Verbose){
					sectionLog(`Assembled`);
					lex.DumpChunks();
				}
			}
			const dumpError		= () => {
				if(Assembler.Verbose){
					sectionLog(`Error`);
					const consoleErrorLog	= (message: string) => {
						console.log('%c' + message, 'color: red');
					}
					lex.DumpErrors(consoleErrorLog);
				}
			}

			// Pass1: split to tokens
			passStart(1);
			if(!lex.SplitTokens(code)){
				dumpError();
				return [null, lex.ErrorMessages];
			}
			passFinish();

			// Pass2: confirm the addresses
			passStart(2);
			if(!lex.ConfirmAddress()){
				dumpError();
				return [null, lex.ErrorMessages];
			}
			passFinish();

			// Pass3: generate binary
			passStart(3);
			if(!lex.GenerateBinary()){
				dumpError();
				return [null, lex.ErrorMessages];
			}
			passFinish();
			dumpChunk();

			return [lex.Chunks, lex.ErrorMessages];
		}

		private ResetLexicalStatus(){
			this.NowScopeName	= '';
			this.NowAddress		= this.StartAddress;
			this.NowDirectPage	= 0;
			this.NowMemoryLength	= true;
			this.NowIndexLength	= true;
		}

		private SplitTokens(code: string, file: string = 'input.asm'): boolean{
			code		= code.replace('\r\n', '\n');
			code		= code.replace('\r', '\n');
			const lines	= code.split('\n');

			let lineNumber	= 0;

			const pushToken	= (tokenType: CodeTokenType, options: (string | number | TokenOption | null)[]) => {
				this.Tokens.push({
					TokenType: tokenType,
					File: file,
					Line: lineNumber + 1,
					Source: lines[lineNumber],
					Address: 0,
					Options: options,
				});
			}
			const pushError	= (message: string) => {
				this.ErrorMessages.push({
					File: file,
					Line: lineNumber + 1,
					Source: lines[lineNumber],
					Message: message,
				});
			}

			for(lineNumber = 0; lineNumber < lines.length; lineNumber++){
				let line	= lines[lineNumber];

				// normalize
				const normalizedLine	= Assembler.NormalizeString(line);
				if(normalizedLine === null){
					pushError('Encountered an unclosed string.');
					continue;
				}

				let remain: string	= normalizedLine;
				while(remain.length > 0){
					let checkRemain: string | null	= null;

					// check directive
					if((checkRemain = this.CheckDirective(remain, pushToken, pushError)) !== null){
						remain	= checkRemain.trim();
						continue;
					}

					// check label
					if((checkRemain = this.CheckLabel(remain, pushToken, pushError)) !== null){
						remain	= checkRemain.trim();
						continue;
					}

					// check instruction
					if((checkRemain = this.CheckInstruction(remain, pushToken, pushError)) !== null){
						remain	= checkRemain.trim();
						continue;
					}

					// check define
					if((checkRemain = this.CheckDefine(remain, pushToken, pushError)) !== null){
						remain	= checkRemain.trim();
						continue;
					}

					// unknown
					pushError('Detected unknown token.');
					break;
				}
			}

			return this.ErrorMessages.length <= 0;
		}

		private CheckDirective(
			line: string,
			pushToken: (tokenType: CodeTokenType, options: (string | number | TokenOption | null)[]) => void,
			pushError: (message: string) => void,
		): string | null{
			let directive: string	= '';
			let remain: string	= '';
			let param: string	= '';
			let params: string[]	= [];

			[directive, remain]	= Assembler.SplitOnce(line);

			const pushDataArray	= (tokenType: CodeTokenType) => {
				const splits	= Assembler.SplitAll(remain, [','], false);
				pushToken(tokenType, splits);
				remain	= '';
			}

			switch(directive){
				case '.org':{
					[param, remain]	= Assembler.SplitOnce(remain);
					if(param.length <= 0){
						pushError(`Parameter not found. (${directive})`);
						return '';
					}

					pushToken(CodeTokenType.DirectiveOrigin, [param]);
					break;
				}

				case '.db':
					pushDataArray(CodeTokenType.DirectiveDataByte);
					break;
				case '.dw':
					pushDataArray(CodeTokenType.DirectiveDataWord);
					break;
				case '.dl':
					pushDataArray(CodeTokenType.DirectiveDataLong);
					break;
				case '.dd':
					pushDataArray(CodeTokenType.DirectiveDataDouble);
					break;

				case '.m8':
					pushToken(CodeTokenType.DirectiveMemoryShort, []);
					break;
				case '.m16':
					pushToken(CodeTokenType.DirectiveMemoryLong, []);
					break;
				case '.i8':
					pushToken(CodeTokenType.DirectiveIndexShort, []);
					break;
				case '.i16':
					pushToken(CodeTokenType.DirectiveIndexLong, []);
					break;

				case '.dp':{
					[param, remain]	= Assembler.SplitOnce(remain);
					if(param.length <= 0){
						pushError(`Parameter not found. (${directive})`);
						return '';
					}

					pushToken(CodeTokenType.DirectiveDirectPointer, [param]);
					break;
				}

				default:
					return null;
			}

			return remain;
		}
		private CheckLabel(
			line: string,
			pushToken: (tokenType: CodeTokenType, options: (string | number | TokenOption | null)[]) => void,
			pushError: (message: string) => void,
		): string | null{
			const [word, remain]	= Assembler.SplitOnce(line);
			const match		= line.match(/^([^\s]+):\s*(.*)/);

			if(match){
				// global label
				const globalLabel	= match[1];
				const remain		= match[2];
				if(globalLabel.match(/[\+\-*/%<>\|\^#$\.]/)){
					pushError('Invalid label name.');
					return '';
				}
				else if(this.LabelList[globalLabel]){
					pushError('Global label name conflict.');
					return '';
				}
				const scope			= new ScopeItem();
				this.LabelList[globalLabel]	= scope;
				this.NowScopeName		= globalLabel;
				pushToken(CodeTokenType.LabelGlobal, [globalLabel]);
				return remain;
			}
			else if(word[0] === '.'){
				// local label
				const localLabel		= word;
				if(localLabel.match(/[\+\-*/%<>\|\^#$]/)){
					pushError('Invalid label name.');
					return '';
				}
				else if((!this.NowScopeName) || (!this.LabelList[this.NowScopeName])){
					pushError('Local label used in global scope.');
					return '';
				}
				else if(this.LabelList[this.NowScopeName].LocalScope[localLabel]){
					pushError('Local label name conflict.');
					return '';
				}
				const label			= new LocalScopeItem();
				this.LabelList[this.NowScopeName].LocalScope[localLabel]	= label;
				pushToken(CodeTokenType.LabelLocal, [localLabel]);
				return remain;
			}
			else if(word === '+'){
				// plus label
				pushToken(CodeTokenType.LabelPlus, []);
				return remain;
			}
			else if(word === '-'){
				// minus label
				pushToken(CodeTokenType.LabelMinus, []);
				return remain;
			}
			return null;
		}
		private CheckInstruction(
			line: string,
			pushToken: (tokenType: CodeTokenType, options: (string | number | TokenOption | null)[]) => void,
			pushError: (message: string) => void,
		): string | null{
			const instructionMatch		= line.match(/^([A-Z]+)(\.\s*([bwl]))?\s*(.*)/i);
			if(!instructionMatch){
				return null;
			}

			const instructionName		= instructionMatch[1].toUpperCase();
			const instructionLength		= (instructionMatch[3] ?? '').toLowerCase();	// no point
			let remain			= instructionMatch[4];

			const instruction		= Assembler.StringToInstruction(instructionName);
			if(!instruction){
				return null;
			}

			let addressingLength: AddressingLength	= AddressingLength.None;
			switch(instructionLength){
				case 'b':	addressingLength	= AddressingLength.Byte;	break;
				case 'w':	addressingLength	= AddressingLength.Word;	break;
				case 'l':	addressingLength	= AddressingLength.Long;	break;
			}

			for(let i = 0; i < Assembler.InstructionPatternList.length; i++){
				const instructionPattern	= Assembler.InstructionPatternList[i];
				const pattern			= instructionPattern.Pattern + '\s*(.*)';
				const operandMatch		= remain.match(pattern);
				if(!operandMatch){
					continue;
				}

				const opcode	= Emulator.InstructionTable[instructionName][instructionPattern.Addressing];
				if(opcode != null){
					const remainIndex	= (operandMatch.length <= 4)? 3 : 4;
					remain	= operandMatch[remainIndex];

					const operand1		= operandMatch[2].trim();
					const operand2		= operandMatch[3].trim();
					const instructionToken 	= new InstructionToken(
						instruction,
						instructionPattern.Addressing,
						addressingLength,
						operand1, operand2,
					);
					pushToken(CodeTokenType.Instruction, [instructionToken]);
					return remain;
				}
				else if(!instructionPattern.Fallback){
					pushError('This addressing can not be used with this instruction.');
					return '';
				}
			}

			return null;
		}
		private CheckDefine(
			line: string,
			pushToken: (tokenType: CodeTokenType, options: (string | number | TokenOption | null)[]) => void,
			pushError: (message: string) => void,
		): string | null{
			const defineMatch	= line.match(/([^\s,]+)\s*=\s*([^,]+)(.*)/);
			if(!defineMatch){
				return null;
			}

			const defineName	= defineMatch[1];
			const defineValue	= defineMatch[2];
			const remain		= defineMatch[3];

			if(defineName.match(/[+\-*/<>\(\)\[\]\{\}\"#$%&\'\|^]/)){
				pushError('Invalid define name.');
				return '';
			}
			else if(this.DefineList[defineName]){
				pushError('Define name conflict.');
				return '';
			}

			const define	= new DefineItem();
			define.Value	= defineValue;
			this.DefineList[defineName]	= define;

			pushToken(CodeTokenType.Define, [defineName]);

			return remain;
		}

		private ConfirmAddress(): boolean{
			let token: Token;

			const pushError		= (message: string) => {
				this.ErrorMessages.push({
					File: token.File,
					Line: token.Line,
					Source: token.Source,
					Message: message,
				});
			}
			const pushTypeError	= () => {
				pushError('Type mismatch.');
			}
			const resolve		= (name: any): number | null => {
				if((typeof(name) !== 'string') && (typeof(name) !== 'number')){
					pushTypeError();
					return null;
				}
				const [value, message]	= this.ResolveValue(name);
				if(value !== null){
					return value;
				}
				else{
					pushError(message);
					return null;
				}
			}

			for(let i = 0; i < this.Tokens.length; i++){
				token		= this.Tokens[i];
				token.Address	= this.NowAddress;
				switch(token.TokenType){
					case CodeTokenType.DirectiveOrigin: {		// ".org"
						const value	= resolve(token.Options[0]);
						if(value === null){
							break;
						}

						this.NowAddress		= value;
						token.Address		= value;	// overwrite
						token.Options[0]	= value;
						break;
					}
					case CodeTokenType.DirectiveDataByte:		// ".db"
						this.NowAddress	+= this.GetDataBytes(token, 1).length;
						break;
					case CodeTokenType.DirectiveDataWord:		// ".dw"
						this.NowAddress	+= this.GetDataBytes(token, 2).length;
						break;
					case CodeTokenType.DirectiveDataLong:		// ".dl"
						this.NowAddress	+= this.GetDataBytes(token, 3).length;
						break;
					case CodeTokenType.DirectiveDataDouble:		// ".dd"
						this.NowAddress	+= this.GetDataBytes(token, 4).length;
						break;
					case CodeTokenType.DirectiveMemoryShort:	// ".m8"
						this.NowMemoryLength	= true;
						break;
					case CodeTokenType.DirectiveMemoryLong:		// ".m16"
						this.NowMemoryLength	= false;
						break;
					case CodeTokenType.DirectiveIndexShort:		// ".i8"
						this.NowIndexLength	= true;
						break;
					case CodeTokenType.DirectiveIndexLong:		// ".i16"
						this.NowIndexLength	= false;
						break;
					case CodeTokenType.DirectiveDirectPointer: {	// ".dp"
						const value	= resolve(token.Options[0]);
						if(value === null){
							break;
						}

						this.NowDirectPage	= value;
						token.Options[0]	= value;
						break;
					}
					case CodeTokenType.LabelGlobal: {		// "Xxx:"
						const name	= token.Options[0];
						if(typeof(name) !== 'string'){
							pushTypeError();
							break;
						}
						this.NowScopeName		= name;
						this.LabelList[name].Address	= this.NowAddress;
						break;
					}
					case CodeTokenType.LabelLocal:			// ".xxx"
						const name	= token.Options[0];
						if(typeof(name) !== 'string'){
							pushTypeError();
							break;
						}
						this.LabelList[this.NowScopeName].LocalScope[name].Address	= this.NowAddress;
						break;
					case CodeTokenType.LabelPlus:			// "+"
						this.PlusLabelList.push(this.NowAddress);
						break;
					case CodeTokenType.LabelMinus:			// "-"
						this.MinusLabelList.push(this.NowAddress);
						break;
					case CodeTokenType.Instruction:			// "LDA"
						const instruction	= token.Options[0];
						if(!(instruction instanceof InstructionToken)){
							pushTypeError();
							break;
						}
						const length	= this.DetermineInstructionAddress(instruction, pushError);
						if(length <= 0){
							pushError('Invalid addressing.');
						}
						this.NowAddress	+= length;
						break;
					case CodeTokenType.Define:			// "Xxx=YY"
						// NOP
						break;
				}
			}

			// NOTE: refer to the label of the nearest address instead of the line number.
			this.PlusLabelList.sort();
			this.MinusLabelList.sort();

			return this.ErrorMessages.length <= 0;
		}
		private DetermineInstructionAddress(
			instruction: InstructionToken,
			pushError: (message: string) => void,
		): number{
			let flagM	= this.NowMemoryLength;
			let flagX	= this.NowIndexLength;
			let valid	= true;

			// Determine instruction addressing
			switch(instruction.Addressing){
				case Emulator.Addressing.Implied:				// imp
				case Emulator.Addressing.Accumulator:				// A
				case Emulator.Addressing.Stack:					// S
				case Emulator.Addressing.Immediate8:				// #imm8
				case Emulator.Addressing.DirectpageIndirect:			// (dp)
				case Emulator.Addressing.DirectpageIndexedIndirectX:		// (dp,X)
				case Emulator.Addressing.DirectpageIndirectIndexedY:		// (dp),Y
				case Emulator.Addressing.DirectpageIndirectLong:		// [dp]
				case Emulator.Addressing.DirectpageIndirectLongIndexedY:	// [dp],Y
				case Emulator.Addressing.AbsoluteIndirect:			// (abs)
				case Emulator.Addressing.AbsoluteIndexedIndirect:		// (abs,X)
				case Emulator.Addressing.AbsoluteIndirectLong:			// [abs]
				case Emulator.Addressing.Relative:				// rel
				case Emulator.Addressing.RelativeLong:				// rlong
				case Emulator.Addressing.StackRelative:				// sr,S
				case Emulator.Addressing.StackRelativeIndirectIndexedY:		// (sr,S),Y
				case Emulator.Addressing.BlockMove:				// xyc
					// NOP
					// `(abs)`, `(abs, X)`, `[abs]` is only used in JMP
					break;

				case Emulator.Addressing.ImmediateMemory:			// #immM
					switch(instruction.AddressingLength){
						case AddressingLength.Byte:
							flagM	= true;
							break;
						case AddressingLength.Word:
							flagM	= false;
							break;
						case AddressingLength.Long:
							return -1;
					}
					break;
				case Emulator.Addressing.ImmediateIndex:			// #immX
					switch(instruction.AddressingLength){
						case AddressingLength.Byte:
							flagX	= true;
							break;
						case AddressingLength.Word:
							flagX	= false;
							break;
						case AddressingLength.Long:
							return -1;
					}
					break;

				case Emulator.Addressing.Directpage:				// dp
				case Emulator.Addressing.Absolute:				// abs
				case Emulator.Addressing.AbsoluteLong:				// long
					valid	= this.DetermineInstructionAddressing(instruction,
						Emulator.Addressing.Directpage,
						Emulator.Addressing.Absolute,
						Emulator.Addressing.AbsoluteLong,
					);
					break;

				case Emulator.Addressing.DirectpageIndexedX:			// dp,X
				case Emulator.Addressing.AbsoluteIndexedX:			// abs,X
				case Emulator.Addressing.AbsoluteLongIndexedX:			// long,X
					valid	= this.DetermineInstructionAddressing(instruction,
						Emulator.Addressing.DirectpageIndexedX,
						Emulator.Addressing.AbsoluteIndexedX,
						Emulator.Addressing.AbsoluteLongIndexedX,
					);
					break;

				case Emulator.Addressing.DirectpageIndexedY:			// dp,Y
				case Emulator.Addressing.AbsoluteIndexedY:			// abs,Y
					valid	= this.DetermineInstructionAddressing(instruction,
						Emulator.Addressing.DirectpageIndexedY,
						Emulator.Addressing.AbsoluteIndexedY,
						null
					);
					break;
			}
			if(!valid){
				return -1;
			}

			return Emulator.GetInstructionLength(instruction.Addressing, flagM, flagX);
		}
		private DetermineInstructionAddressing(
			instruction: InstructionToken,
			addressingDp: Emulator.Addressing,
			addressingAbs: Emulator.Addressing,
			addressingLong: Emulator.Addressing | null,
		): boolean{
			const instructionTableEntry	= Emulator.InstructionTable[Emulator.Instruction[instruction.Instruction]];
			let useAddressing: Emulator.Addressing	= addressingAbs;

			// for JML, JSL
			if(
				(addressingLong !== null) &&
				((instructionTableEntry[addressingDp] === null) && (instructionTableEntry[addressingAbs] === null) && (instructionTableEntry[addressingLong] !== null))
			){
				instruction.AddressingLength	= AddressingLength.Long;
			}

			switch(instruction.AddressingLength){
				case AddressingLength.None:{
					// get target address
					const [target, message]	= this.ResolveValue(instruction.Operand1);
					if(target === null){
						break;
					}

					// long
					const availableLong	= (addressingLong !== null) && (instructionTableEntry[addressingLong] !== null);
					if(availableLong && ((this.NowAddress & 0xFF0000) != (target & 0xFF0000))){
						useAddressing	= addressingLong;
						break;
					}

					// dp
					const availableDp	= (instructionTableEntry[addressingDp] !== null);
					if(availableDp && (Utility.Math.IsRange((target & 0x00FFFF) - this.NowDirectPage, 0, 0x100))){
						useAddressing	= addressingDp;
						break;
					}

					break;
				}
				case AddressingLength.Byte:
					useAddressing	= addressingDp;
					break;
				case AddressingLength.Word:
					useAddressing	= addressingAbs;
					break;
				case AddressingLength.Long:
					if(addressingLong === null){
						return false;
					}
					useAddressing	= addressingLong;
					break;
			}

			// check if instruction exists
			if(instructionTableEntry[useAddressing] !== null){
				instruction.Addressing	= useAddressing;
				return true;
			}
			else{
				return false;
			}
		}

		private GenerateBinary(): boolean{
			let token: Token;
			let chunk	= new DataChunk();
			chunk.Address	= this.NowAddress;

			const pushError		= (message: string) => {
				this.ErrorMessages.push({
					File: token.File,
					Line: token.Line,
					Source: token.Source,
					Message: message,
				});
			}
			const pushTypeError	= () => {
				pushError('Type mismatch.');
			}
			const resolve		= (name: any): number | null => {
				if((typeof(name) !== 'string') && (typeof(name) !== 'number')){
					pushTypeError();
					return null;
				}
				const [value, message]	= this.ResolveValue(name);
				if(value !== null){
					return value;
				}
				else{
					pushError(message);
					return null;
				}
			}

			for(let i = 0; i < this.Tokens.length; i++){
				token		= this.Tokens[i];
				this.NowAddress	= token.Address;

				switch(token.TokenType){
					case CodeTokenType.DirectiveOrigin: {		// ".org"
						// push chunk
						if(chunk.Data.length > 0){
							this.Chunks.push(chunk);
						}
						chunk			= new DataChunk();
						chunk.Address		= token.Address;

						break;
					}
					case CodeTokenType.DirectiveDataByte: {		// ".db"
						const data	= this.GetDataBytes(token, 1);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveDataWord: {		// ".dw"
						const data	= this.GetDataBytes(token, 2);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveDataLong: {		// ".dl"
						const data	= this.GetDataBytes(token, 3);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveDataDouble: {	// ".dd"
						const data	= this.GetDataBytes(token, 4);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveMemoryShort:	// ".m8"
						this.NowMemoryLength	= true;
						break;
					case CodeTokenType.DirectiveMemoryLong:		// ".m16"
						this.NowMemoryLength	= false;
						break;
					case CodeTokenType.DirectiveIndexShort:		// ".i8"
						this.NowIndexLength	= true;
						break;
					case CodeTokenType.DirectiveIndexLong:		// ".i16"
						this.NowIndexLength	= false;
						break;
					case CodeTokenType.DirectiveDirectPointer: {	// ".dp"
						const value	= resolve(token.Options[0]);
						if(value === null){
							break;
						}

						this.NowDirectPage	= value;
						break;
					}
					case CodeTokenType.LabelGlobal: {		// "Xxx:"
						const name	= token.Options[0];
						if(typeof(name) !== 'string'){
							pushTypeError();
							break;
						}
						this.NowScopeName		= name;
						break;
					}
					case CodeTokenType.LabelLocal:			// ".xxx"
					case CodeTokenType.LabelPlus:			// "+"
					case CodeTokenType.LabelMinus:			// "-"
						// NOP
						break;
					case CodeTokenType.Instruction:			// "LDA"
						const instruction	= token.Options[0];
						if(!(instruction instanceof InstructionToken)){
							pushTypeError();
							break;
						}
						this.PushInstructionBinary(chunk, instruction, pushError);
						break;
					case CodeTokenType.Define:			// "Xxx=YY"
						// NOP
						break;
				}
			}

			// push chunk
			if(chunk.Data.length > 0){
				this.Chunks.push(chunk);
			}

			return this.ErrorMessages.length <= 0;
		}
		private PushInstructionBinary(
			chunk: DataChunk,
			instruction: InstructionToken,
			pushError: (message: string) => void,
		){
			const instructionEntry	= Emulator.InstructionTable[Emulator.Instruction[instruction.Instruction]];
			if(instructionEntry === null){
				pushError('Invalid instruction.');
				return;
			}
			const instructionByte	= instructionEntry[instruction.Addressing];
			if(instructionByte === null){
				pushError('Invalid instruction addressing.');
				return;
			}

			const pushByte	= (value: number) => {
				value	= Utility.Type.ToByte(value);
				chunk.Data.push( value        & 0xFF);
			}
			const pushWord	= (value: number) => {
				value	= Utility.Type.ToWord(value);
				chunk.Data.push( value        & 0xFF);
				chunk.Data.push((value >>  8) & 0xFF);
			}
			const pushLong	= (value: number) => {
				value	= Utility.Type.ToLong(value);
				chunk.Data.push( value        & 0xFF);
				chunk.Data.push((value >>  8) & 0xFF);
				chunk.Data.push((value >> 16) & 0xFF);
			}

			pushByte(instructionByte);

			switch(instruction.Addressing){
				case Emulator.Addressing.Implied:				// imp
				case Emulator.Addressing.Accumulator:				// A
				case Emulator.Addressing.Stack:					// S
				{
					// NOP
					break;
				}

				case Emulator.Addressing.Immediate8:				// #imm8
				case Emulator.Addressing.StackRelative:				// sr,S
				case Emulator.Addressing.StackRelativeIndirectIndexedY:		// (sr,S),Y
				{
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}
					pushByte(operand1);
					break;
				}

				case Emulator.Addressing.Directpage:				// dp
				case Emulator.Addressing.DirectpageIndexedX:			// dp,X
				case Emulator.Addressing.DirectpageIndexedY:			// dp,Y
				case Emulator.Addressing.DirectpageIndirect:			// (dp)
				case Emulator.Addressing.DirectpageIndexedIndirectX:		// (dp,X)
				case Emulator.Addressing.DirectpageIndirectIndexedY:		// (dp),Y
				case Emulator.Addressing.DirectpageIndirectLong:		// [dp]
				case Emulator.Addressing.DirectpageIndirectLongIndexedY:	// [dp],Y
				{
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}
					const effective	= (operand1 & 0x00FFFF) - this.NowDirectPage;
					if((instruction.AddressingLength === AddressingLength.Byte) || (Utility.Math.IsRange(effective, 0, 0x100))){
						pushByte(effective);
					}
					else{
						pushError('Direct page out of bounds.');
						break;
					}
					break;
				}

				case Emulator.Addressing.ImmediateMemory: {			// #immM
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}

					const isByte	= (instruction.AddressingLength === AddressingLength.Byte)
							|| ((instruction.AddressingLength === AddressingLength.None) && this.NowMemoryLength);
					if(isByte){
						pushByte(operand1);
					}
					else{
						pushWord(operand1);
					}
					break;
				}
				case Emulator.Addressing.ImmediateIndex: {			// #immX
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}

					const isByte	= (instruction.AddressingLength === AddressingLength.Byte)
							|| ((instruction.AddressingLength === AddressingLength.None) && this.NowIndexLength);
					if(isByte){
						pushByte(operand1);
					}
					else{
						pushWord(operand1);
					}
					break;
				}

				case Emulator.Addressing.Absolute:				// abs
				case Emulator.Addressing.AbsoluteIndexedX:			// abs,X
				case Emulator.Addressing.AbsoluteIndexedY:			// abs,Y
				case Emulator.Addressing.AbsoluteIndirect:			// (abs)
				case Emulator.Addressing.AbsoluteIndexedIndirect:		// (abs,X)
				case Emulator.Addressing.AbsoluteIndirectLong:			// [abs]
				{
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}
					pushWord(operand1);
					break;
				}

				case Emulator.Addressing.AbsoluteLong:				// long
				case Emulator.Addressing.AbsoluteLongIndexedX:			// long,X
				{
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}
					pushLong(operand1);
					break;
				}

				case Emulator.Addressing.Relative: {				// rel
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}
					const nextAddress	= this.NowAddress + 2;
					const effective		= operand1 - nextAddress;
					if(Utility.Math.IsRange(effective, -0x80, 0x7F)){
						pushByte(effective);
					}
					else{
						pushError('Relative address range exceeded.');
						break;
					}
					break;
				}
				case Emulator.Addressing.RelativeLong: {			// rlong
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					if(operand1 === null){
						pushError('Failed to resolve operand. ' + message1);
						break;
					}
					const nextAddress	= this.NowAddress + 3;
					const effective		= operand1 - nextAddress;
					if(Utility.Math.IsRange(effective, -0x8000, 0x7FFF)){
						pushWord(effective);
					}
					else{
						pushError('Relative address range exceeded.');
						break;
					}
					break;
				}
				case Emulator.Addressing.BlockMove: {				// xyc
					const [operand1, message1]	= this.ResolveValue(instruction.Operand1);
					const [operand2, message2]	= this.ResolveValue(instruction.Operand2);
					const operand1Failed		= operand1 === null;
					const operand2Failed		= operand2 === null;
					if(operand1Failed || operand2Failed){
						if(operand1Failed){
							pushError('Failed to resolve operand. ' + message1);
						}
						if(operand2Failed){
							pushError('Failed to resolve operand. ' + message2);
						}
						break;
					}
					pushByte(operand2);
					pushByte(operand1);
					break;
				}
			}
		}

		private static DecodeValue(str: string) : number | null{
			let match : RegExpMatchArray | null;

			let sign	= 1;
			if(str[0] === '-'){
				sign	= -1;
				str	= str.substring(1);
			}

			// hex: `$xxx`
			match	= str.match(/^\$([\dA-F]+)$/i);
			if(match){
				const c	= match[1];
				return parseInt(c, 16) * sign;
			}

			// bin: `%xxxx_xxxx`
			match	= str.match(/^%([01_]+)$/i);
			if(match){
				const c	= match[1].replace('_', '');
				return parseInt(c, 2);
			}

			// dec: `xxx`
			match	= str.match(/^(\d+)$/i);
			if(match){
				const c	= match[1];
				return parseInt(c, 10);
			}

			return null;
		}

		private ResolveValue(name: string | number, depth: number = 1): [number | null, string]{
			// check number
			if(typeof(name) === 'number'){
				return [name, ''];
			}

			// check depth
			if(depth > 100){
				return [null, 'The definition is too deep.'];
			}

			// define
			if(this.DefineList[name]){
				const valueString	= this.DefineList[name].Value;
				const [value, message]	= this.ResolveValue(valueString, depth + 1);
				if(value !== null){
					return [value, 'define']
				}
				else{
					return [null, message];
				}
			}

			// plus label
			if(name === '+'){
				for(let i = 0; i < this.PlusLabelList.length; i++){
					if(this.NowAddress < this.PlusLabelList[i]){
						return [this.PlusLabelList[i], 'plus label'];
					}
				}
				return [null, 'Plus label resolution failed.'];
			}

			// minus label
			if(name === '-'){
				for(let i = this.MinusLabelList.length - 1; i >= 0; i--){
					if(this.MinusLabelList[i] < this.NowAddress){
						return [this.MinusLabelList[i], 'minus label'];
					}
				}
				return [null, 'Minus label resolution failed.'];
			}

			// expression
			const matchExpression	= name.match(/^([^\s*/%<>\|\^][^\s\+\-*/%<>\|\^]*)\s*([\+\-*/%<>\|\^]+)\s*(.*)$/);
			if(matchExpression){
				const leftString	= matchExpression[1];
				const operator		= matchExpression[2];
				const rightString	= matchExpression[3];
				const operatorFunction	= Assembler.OperatorFunctions[operator];
				if(!operatorFunction){
					return [null, 'Invalid operator.'];
				}

				const [leftValue, leftMessage]		= this.ResolveValue(leftString);
				const [rightValue, rightMessage]	= this.ResolveValue(rightString);
				if(leftValue === null){
					return [null, leftMessage];
				}
				if(rightValue === null){
					return [null, rightMessage];
				}
				return [operatorFunction(leftValue, rightValue), 'expression'];
			}

			// local label
			if(name[0] === '.'){
				const scope	= this.LabelList[this.NowScopeName];
				if(!scope){
					return [null, 'Scope resolution failed.'];
				}
				const label	= scope.LocalScope[name];
				if(!label){
					return [null, 'Local label resolution failed.'];
				}
				return [label.Address, 'local label'];
			}

			// global label
			if(this.LabelList[name]){
				const label	= this.LabelList[name];
				return [label.Address, 'global label'];
			}

			// number
			{
				const value	= Assembler.DecodeValue(name);
				if(value !== null){
					return [value, 'number'];
				}
			}

			return [null, `Failed to resolve "${name}".`];
		}

		private GetDataBytes(token: Token, baseSize: number): number[]{
			const data: number[]	= [];

			const pushValue	= (value: number) => {
				for(let i = 0; i < baseSize; i++){
					const byte	= value & 0xFF;
					data.push(byte);

					value	>>= 8;
				}
			}

			for(let i = 0; i < token.Options.length; i++){
				const option	= token.Options[i];
				if(typeof(option) === 'number'){
					pushValue(option);
				}
				else if(typeof(option) === 'string'){
					if(option[0] === '"'){
						// string
						for(let j = 1; j < (option.length - 1); j++){
							const char	= option.codePointAt(j);
							pushValue((char !== undefined)? char : 0);
						}
					}
					else{
						const [resolved, message]	= this.ResolveValue(option);
						pushValue((resolved !== null)? resolved : 0);
					}
				}
				else{
				}
			}

			return data;
		}

		private static NormalizeString(str: string): string | null{
			// remove comment
			// remove contiguous space
			// remove first and last space

			const reader	= new Utility.CharacterReadStream(str);
			let output	= '';

			while(!reader.ReadEnd()){
				const c			= reader.Read();
				if(c == null){
					// invalid format
					return null;
				}

				const prevChar		= output[output.length - 1];
				const isSpace		= c.trim().length <= 0;
				if(isSpace){
					if(prevChar !== ' '){
						output	+= ' ';
						continue;
					}
					else{
						// skip consecutive spaces
						continue;
					}
				}

				if(c == ';'){
					// comment
					break;
				}
				if(c == '/'){
					if(prevChar !== '/'){
						// accept once
						output	+= ' ';
					}
					else{
						// slash comment, cancel last character
						output	= output.substring(0, output.length - 1);
						break;
					}
					break;
				}
				output	+= c;
			}

			return output.trim();
		}
		private static SplitOnce(str: string, splits: string[] = [' ']): [string, string]{
			const reader	= new Utility.CharacterReadStream(str);

			let left	= '';
			let right	= '';

			while(!reader.ReadEnd()){
				const c		= reader.Read();
				if(!c){
					break;
				}

				if(splits.includes(c)){
					break;
				}
				else{
					left	+= c;
				}
			}
			right	= reader.Remaining().trim();

			return [left, right];
		}
		private static SplitAll(str: string, splits: string[] = [' '], skipBlank: boolean = false): string[]{
			const reader	= new Utility.CharacterReadStream(str);
			const list: string[]	= [];
			let item	= '';

			while(!reader.ReadEnd()){
				const c		= reader.Read();
				if(!c){
					break;
				}

				if(splits.includes(c)){
					const isPush	= (!skipBlank) || (item.length > 0);
					const space	= (item.length <= 0) && (c === ' ');
					if(isPush && !space){
						list.push(item.trim());
					}
					item	= '';
				}
				else{
					item	+= c;
				}
			}

			if((!skipBlank) || (item.length > 0)){
				list.push(item.trim());
			}

			return list;
		}

		private static InstructionPatternList: InstructionPattern[] = [
		//	Pattern								Addressing							Fallback
			{Pattern: `^(([Aa]))`,						Addressing: Emulator.Addressing.Accumulator,			Fallback: false	},	// "A"
			{Pattern: `^(#(.+))`,						Addressing: Emulator.Addressing.Immediate8,			Fallback: true	},	// "#xx"	// #imm8 (REP, SEP, ...)
			{Pattern: `^(#(.+))`,						Addressing: Emulator.Addressing.ImmediateMemory,		Fallback: true	},	// "#xx"	// #immM (LDA, STA, ...)
			{Pattern: `^(#(.+))`,						Addressing: Emulator.Addressing.ImmediateIndex,			Fallback: false	},	// "#xx"	// #immX (LDX, STX, ...)
			{Pattern: `^(\\(\\s*([^,]+)\\s*,\\s*[Xx]\\s*\\))`,		Addressing: Emulator.Addressing.DirectpageIndexedIndirectX,	Fallback: true	},	// "(xx, X)"	// dp
			{Pattern: `^(\\(\\s*([^,]+)\\s*,\\s*[Xx]\\s*\\))`,		Addressing: Emulator.Addressing.AbsoluteIndexedIndirect,	Fallback: false	},	// "(xx, X)"	// abs
			{Pattern: `^(\\(\\s*([^,]+)\\s*,\\s*[Ss]\\s*\\)\\s*,\\s*[Yy])`,	Addressing: Emulator.Addressing.StackRelativeIndirectIndexedY,	Fallback: false	},	// "(xx, S), Y"
			{Pattern: `^(\\(\\s*([^,]+)\\s*\\)\\s*,\\s*[Yy])`,		Addressing: Emulator.Addressing.DirectpageIndirectIndexedY,	Fallback: false	},	// "(xx), Y"
			{Pattern: `^(\\[\\s*([^,]+)\\s*\\]\\s*,\\s*[Yy])`,		Addressing: Emulator.Addressing.DirectpageIndirectLongIndexedY,	Fallback: false	},	// "[xx], Y"
			{Pattern: `^(\\(\\s*([^,]+)\\s*\\))`,				Addressing: Emulator.Addressing.DirectpageIndirect,		Fallback: true	},	// "(xx)"	// dp
			{Pattern: `^(\\(\\s*([^,]+)\\s*\\))`,				Addressing: Emulator.Addressing.AbsoluteIndirect,		Fallback: false	},	// "(xx)"	// abs
			{Pattern: `^(\\[\\s*([^,]+)\\s*\\])`,				Addressing: Emulator.Addressing.AbsoluteIndirectLong,		Fallback: true	},	// "[xx]"	// dp
			{Pattern: `^(\\[\\s*([^,]+)\\s*\\])`,				Addressing: Emulator.Addressing.DirectpageIndirectLong,		Fallback: false	},	// "[xx]"	// abs
			{Pattern: `^(([^,]+)\\s*,\\s*[Xx])`,				Addressing: Emulator.Addressing.DirectpageIndexedX,		Fallback: false	},	// "xx, X"	// dp, abs, long
			{Pattern: `^(([^,]+)\\s*,\\s*[Yy])`,				Addressing: Emulator.Addressing.DirectpageIndexedY,		Fallback: true	},	// "xx, Y"	// dp
			{Pattern: `^(([^,]+)\\s*,\\s*[Yy])`,				Addressing: Emulator.Addressing.AbsoluteIndexedY,		Fallback: false	},	// "xx, Y"	// abs
			{Pattern: `^(([^,]+)\\s*,\\s*[Ss])`,				Addressing: Emulator.Addressing.StackRelative,			Fallback: false	},	// "xx, S"
			{Pattern: `^(([^,]+),\\s*([^,]+))`,				Addressing: Emulator.Addressing.BlockMove,			Fallback: false	},	// "src, dst"
			{Pattern: `^(([^,]+))`,						Addressing: Emulator.Addressing.Relative,			Fallback: true	},	// "xx"		// rel
			{Pattern: `^(([^,]+))`,						Addressing: Emulator.Addressing.RelativeLong,			Fallback: true	},	// "xx"		// rlong
			{Pattern: `^(([^,]+))`,						Addressing: Emulator.Addressing.Directpage,			Fallback: true	},	// "xx"		// dp
			{Pattern: `^(([^,]+))`,						Addressing: Emulator.Addressing.Absolute,			Fallback: true	},	// "xx"		// abs
			{Pattern: `^(([^,]+))`,						Addressing: Emulator.Addressing.AbsoluteLong,			Fallback: false	},	// "xx"		// long
			{Pattern: `^(())`,						Addressing: Emulator.Addressing.Accumulator,			Fallback: true	},	// ""
			{Pattern: `^(())`,						Addressing: Emulator.Addressing.Stack,				Fallback: true	},	// ""
			{Pattern: `^(())`,						Addressing: Emulator.Addressing.Implied,			Fallback: false	},	// ""
		];

		private static OperatorFunctions: {[operator: string]: (a: number, b: number) => number} = {
			'+':  (a: number, b: number) => a + b,
			'-':  (a: number, b: number) => a - b,
			'*':  (a: number, b: number) => a * b,
			'/':  (a: number, b: number) => a / b,
			'%':  (a: number, b: number) => a % b,
			'<<': (a: number, b: number) => a << b,
			'>>': (a: number, b: number) => a >> b,
			'&':  (a: number, b: number) => a & b,
			'|':  (a: number, b: number) => a | b,
			'^':  (a: number, b: number) => a ^ b,
		};

		private static StringToInstruction(str: string): Emulator.Instruction | null{
			let i	= 0;
			while(Emulator.Instruction[i] !== undefined){
				if(Emulator.Instruction[i] === str){
					return i;
				}
				i++;
			}
			return null;
		}

		public static ConvertErrorStrings(errorMessages: ErrorMessage[], newline: string = '\n'): string[]{
			const errorStrings: string[]	= [];

			for(let i = 0; i < errorMessages.length; i++){
				const m	= errorMessages[i];
				errorStrings.push(`[${i}] Line:${m.Line} ${m.Message}` + newline + m.Source);
			}

			return errorStrings;
		}

		private DumpTokens(print: (message: string) => void = console.log, newline: string = '\n'){
			// for debug
			for(let i = 0; i < this.Tokens.length; i++){
				const t	= this.Tokens[i];
				let l	= `[${i}] Line:${t.Line} $${Utility.Format.ToHexString(t.Address, 6)} ${CodeTokenType[t.TokenType]}: #${t.Options.length} ${t.Options}`;

				if(t.Options[0] instanceof InstructionToken){
					l	+= newline + t.Options[0].ToString();
				}

				print(l);
			}
		}
		private DumpChunks(print: (message: string) => void = console.log, newline: string = '\n', columns = 16){
			// for debug
			for(let i = 0; i < this.Chunks.length; i++){
				const chunk	= this.Chunks[i];
				let str		= `[${i}] $${Utility.Format.ToHexString(chunk.Address, 6)} ${chunk.Data.length} byte(s)`;
				for(let j = 0; j < chunk.Data.length; j++){
					if((j % columns) == 0){
						str	+= newline + `  $${Utility.Format.ToHexString(chunk.Address + j, 6)} :`;
					}
					str	+= ` ${Utility.Format.ToHexString(chunk.Data[j], 2)}`;
				}
				print(str);
			}
		}
		private DumpErrors(print: (message: string) => void = console.log){
			// for debug
			const errorStrings	= Assembler.ConvertErrorStrings(this.ErrorMessages);

			for(let i = 0; i < errorStrings.length; i++){
				print(errorStrings[i]);
			}
		}
	}

	export type ErrorMessage = {
		File: string;
		Line: number;
		Source: string;
		Message: string;
	}

	enum CodeTokenType{
		Invalid,
		DirectiveOrigin,	// ".org"
		DirectiveDataByte,	// ".db"
		DirectiveDataWord,	// ".dw"
		DirectiveDataLong,	// ".dl"
		DirectiveDataDouble,	// ".dd"
		DirectiveMemoryShort,	// ".m8"
		DirectiveMemoryLong,	// ".m16"
		DirectiveIndexShort,	// ".i8"
		DirectiveIndexLong,	// ".i16"
		DirectiveDirectPointer,	// ".dp"
		LabelGlobal,		// "Xxx:"
		LabelLocal,		// ".xxx"
		LabelPlus,		// "+"
		LabelMinus,		// "-"
		Instruction,		// "LDA"
		Define,			// "Xxx=YY"
	}
	class Token{
		TokenType: CodeTokenType	= CodeTokenType.Invalid;
		File: string	= '';
		Line: number	= 0;
		Source: string	= ''
		Address: number	= 0;
		Options: (string | number | TokenOption | null)[]	= [];
	}
	interface TokenOption{}
	class InstructionToken implements TokenOption{
		constructor(
			public Instruction: Emulator.Instruction,
			public Addressing: Emulator.Addressing,
			public AddressingLength: AddressingLength,
			public Operand1: string		= '',
			public Operand2: string		= '',
		){}

		public ToString(): string{
			// for Debug
			return `${Emulator.Instruction[this.Instruction]}`
				+ ` ${Emulator.Addressing[this.Addressing]} (${AddressingLength[this.AddressingLength]})`
				+ ` [${this.Operand1}, ${this.Operand2}]`;
		}
	}
	enum AddressingLength{
		None,
		Byte,
		Word,
		Long,
	}

	class ScopeItem{
		Address: number	= 0;
		LocalScope: { [LocalLabel: string]: LocalScopeItem}	= {};
	}
	class LocalScopeItem{
		Address: number	= 0;
	}

	class DefineItem{
		Value: number | string	= 0;
	}

	export class DataChunk{
		Address: number	= 0;
		Data: number[]	= [];
	}

	class InstructionPattern{
		Pattern: string			= '';
		Addressing: Emulator.Addressing	= Emulator.Addressing.Implied;
		Fallback: boolean		= true;
	}

	export class HexFile{
		public static ChunksToText(chunks: DataChunk[], columns = 16): string[] {
			const hexFile: string[]	= [];

			for(let i = 0; i < chunks.length; i++){
				const chunk		= chunks[i];
				let str			= `[${i}] $${Utility.Format.ToHexString(chunk.Address, 6)} ${chunk.Data.length} byte(s)`;

				for(let j = 0; j < chunk.Data.length; j++){
					if((j % columns) == 0){
						hexFile.push(str);
						str	= `  $${Utility.Format.ToHexString(chunk.Address + j, 6)} :`;
					}
					str	+= ` ${Utility.Format.ToHexString(chunk.Data[j], 2)}`;
				}
				hexFile.push(str);
			}

			return hexFile;
		}
		public static ChunksToIntelHex(chunks: DataChunk[]): string[] {
			const hexFile: string[]	= [];

			const pushData	= (data: number[]) => {
				let checksum	= 0;
				let str		= ':';
				data[0]		= data.length - 4;
				for(let i = 0; i < data.length; i++){
					const value	= Utility.Type.ToByte(data[i]);
					checksum	+= value;
					str		+= Utility.Format.ToHexString(value, 2);
				}
				checksum	= Utility.Type.ToByte(-checksum);
				str		+= Utility.Format.ToHexString(checksum, 2);
				hexFile.push(str);
			}

			for(let c = 0; c < chunks.length; c++){
				const chunk	= chunks[c];

				// 24 bit address (bank)
				pushData([0x02, 0x00, 0x00, 0x04, chunk.Address >> 24, chunk.Address >> 16]);

				// data
				let content: number[]	= [0x00, chunk.Address >> 8, chunk.Address, 0x00];
				for(let i = 0; i < chunk.Data.length; i++){
					if(content.length >= (16 + 4)){
						pushData(content);
						const address	= chunk.Address + i;
						content	= [0x00, address >> 8, address, 0x00];
					}
					content.push(chunk.Data[i]);
				}
				if(content.length > 4){
					pushData(content);
				}

				// EOF
				pushData([0x00, 0x00, 0x00, 0x01]);
			}

			return hexFile;
		}
		public static ChunksToSRec(chunks: DataChunk[]): string[]{
			// S28 format
			const hexFile: string[]	= [];

			const pushData	= (data: number[]) => {
				let checksum	= Utility.Type.ToByte(data.length - 1);
				let str		= 'S' + data[0] + Utility.Format.ToHexString(checksum, 2);
				for(let i = 2; i < data.length; i++){
					const value	= Utility.Type.ToByte(data[i]);
					checksum	+= value;
					str		+= Utility.Format.ToHexString(value, 2);
				}
				checksum	= Utility.Type.ToByte(checksum ^ 0xFF);
				str		+= Utility.Format.ToHexString(checksum, 2);
				hexFile.push(str);
			}

			for(let c = 0; c < chunks.length; c++){
				const chunk	= chunks[c];

				// data
				let content: number[]	= [0x02, 0x00, chunk.Address >> 16, chunk.Address >> 8, chunk.Address];
				for(let i = 0; i < chunk.Data.length; i++){
					if(content.length >= (16 + 5)){
						pushData(content);
						const address	= chunk.Address + i;
						content	= [0x02, 0x00, address >> 16, address >> 8, address];
					}
					content.push(chunk.Data[i]);
				}
				if(content.length > 5){
					pushData(content);
				}

				// EOF
				pushData([0x08, 0x00, 0x00, 0x00, 0x00]);
			}

			return hexFile;
		}
	}
}

//--------------------------------------------------

namespace Application{

	export class Main{
		private static readonly AssembleStartAddress		= 0x808000;	// FastROM area and address where RAM can be accessed for both LoROM and HiROM

		private static Assembled: Assembler.DataChunk[] | null	= null;
		private static Memory: Emulator.Memory			= new Emulator.Memory();
		private static Cpu: Emulator.Cpu			= new Emulator.Cpu(this.Memory);

		static Dom: {[name: string]: HTMLElement}	= {
			'ErrorMessage':		document.createElement('span'),
			'AssemblerSource':	document.createElement('span'),
			'AssemblerOutput':	document.createElement('span'),
			'HexIntelHex':		document.createElement('span'),
			'HexSrec':		document.createElement('span'),
			'AssemblerAssemble':	document.createElement('span'),
			'AssembledRun':		document.createElement('span'),
		};

		public static Initialize(){
			Main.Assembled	= null;

			if(!Main.GetDomElements()){
				return;
			}

			Main.Dom.ErrorMessage.classList.add('hide');

			Main.AllowTab(Main.Dom.AssemblerSource as HTMLInputElement);

			Main.Dom.AssemblerAssemble.removeAttribute('disabled');
			Main.Dom.AssemblerAssemble.addEventListener('click', Main.Assemble);
			Main.Dom.AssembledRun.addEventListener('click', Main.Run);
		}

		private static GetDomElements(): boolean{
			const set	= (name: string): boolean => {
				const element	= document.querySelector<HTMLElement>('#' + name);
				if(element){
					Main.Dom[name]	= element;
					return true;
				}
				return false;
			}
			if(	true	// placeholder
				&& set("ErrorMessage")
				&& set("AssemblerSource")
				&& set("AssemblerOutput")
				&& set("HexIntelHex")
				&& set("HexSrec")
				&& set("AssemblerAssemble")
				&& set("AssembledRun")
			){
				return true;
			}
			return false;
		}

		public static Assemble(){
			Main.Assembled	= null;

			const sourceElement	= Main.Dom.AssemblerSource as HTMLInputElement;
			const source		= sourceElement.value;
			if(!source){
				Main.SetAssemblerError(false, []);
				return;
			}
			const [assembled, message]	= Assembler.Assembler.Assemble(source, Main.AssembleStartAddress);
			if(assembled === null){
				Main.SetAssemblerError(false, message);
				return;
			}

			const outputHex	= Assembler.HexFile.ChunksToText(assembled);
			Main.SetTextareaStrings(Main.Dom.AssemblerOutput, outputHex);
			const intelHex	= Assembler.HexFile.ChunksToIntelHex(assembled);
			Main.SetTextareaStrings(Main.Dom.HexIntelHex, intelHex);
			const mSrec	= Assembler.HexFile.ChunksToSRec(assembled);
			Main.SetTextareaStrings(Main.Dom.HexSrec, mSrec);

			Main.SetAssemblerError(true, []);

			Main.Assembled	= assembled;
		}

		public static Run(){
			const memory	= new Emulator.Memory();
			Main.Memory	= memory;

			// TODO: Set from form
			memory.ROMMapping	= Emulator.ROMMapping.LoROM;
			memory.IsFastROM	= false;
			const maxCycle		= 10000;
			const statusFlagE	= false;

			Main.UploadDefaultMemory();
			Main.UploadMemory();

			const cpu		= new Emulator.Cpu(Main.Memory);
			Main.Cpu		= cpu;

			const initialRegisters	= new Emulator.Registers();
			initialRegisters.SetStatusFlagE(statusFlagE);
			cpu.ResetRegisters	= {
			//	PB:	Utility.Type.ToByte(Main.AssembleStartAddress >> 16),
			//	PC:	Utility.Type.ToWord(Main.AssembleStartAddress),
				E:	(statusFlagE)? 1 : 0,
			//	P:	0x14,	// TODO: Debug .longm
			};

			cpu.Boot();

			// TODO: Debug
			let stepCounter	= 0;
			// while(!cpu.CpuHalted && (cpu.CycleCounter < maxCycle)){
			while(!cpu.CpuHalted && (cpu.MasterCycleCounter < maxCycle) && ((cpu.Logs.length <= 0) || (cpu.Logs[cpu.Logs.length - 1].Instruction !== Emulator.Instruction.BRK))){
				cpu.Step();
				stepCounter++;
			}

			// TODO: Debug
			Main.DumpCpuLog(cpu);
			console.log(`Total Master Cycle: ${cpu.MasterCycleCounter}`);
			console.log(`Total CPU Cycle: ${cpu.CpuCycleCounter}`);
			console.log(`Total Step: ${stepCounter}`);
		}

		private static UploadChunk(memory: Emulator.Memory, chunk: Assembler.DataChunk){
			for(let i = 0; i < chunk.Data.length; i++){
				memory.WriteByte(chunk.Address + i, chunk.Data[i], true);
			}
		}
		private static UploadDefaultMemory(){
			const resetVector: Assembler.DataChunk	= {
				Address: 0x00FFE0,
				Data: []
			}
			const pushWord	= (chunk: Assembler.DataChunk, value: number) => {
				chunk.Data.push(Utility.Type.ToByte(value >>  0));
				chunk.Data.push(Utility.Type.ToByte(value >>  8));
			}
			for(let i = 0; i < 16; i++){
				pushWord(resetVector, Main.AssembleStartAddress);
			}

			Main.UploadChunk(Main.Memory, resetVector);
		}
		private static UploadMemory(){
			if(Main.Assembled === null){
				return;
			}
			for(let i = 0; i < Main.Assembled.length; i++){
				Main.UploadChunk(Main.Memory, Main.Assembled[i]);
			}
		}

		private static SetAssemblerError(success: boolean, errorMessages: Assembler.ErrorMessage[]){
			const className	= 'errorMessage';
			if(success){
				Main.Dom.AssemblerOutput.classList.remove(className);
				Main.Dom.AssembledRun.removeAttribute('disabled');
			}
			else{
				const messages	= Assembler.Assembler.ConvertErrorStrings(errorMessages);
				Main.SetTextareaStrings(Main.Dom.AssemblerOutput, messages);
				Main.Dom.AssemblerOutput.classList.add(className);

				Main.ClearTextarea(Main.Dom.HexIntelHex);
				Main.ClearTextarea(Main.Dom.HexSrec);
				Main.Dom.AssembledRun.setAttribute('disabled', '');
			}
		}
		private static SetTextareaStrings(textarea: Element, strings: string[]){
			let text	= '';
			for(let i = 0; i < strings.length; i++){
				text	+= strings[i] + '\n';
			}

			textarea.textContent	= text;
		}
		private static ClearTextarea(textarea: Element){
			textarea.textContent	= '';
		}

		private static AllowTab(element: HTMLInputElement){
			element.addEventListener('keydown', (e: KeyboardEvent) => {
				Main.AllowTabEvent(element, e);
			});
		}
		private static AllowTabEvent(obj: HTMLInputElement, e: KeyboardEvent){
			if(e.key !== 'Tab'){
				return;
			}
			e.preventDefault();

			let value		= obj.value;
			const selectStart	= obj.selectionStart ?? 0;
			const selectEnd		= obj.selectionEnd ?? 0;
			const selectLeft	= value.substring(0, selectStart);
			let selectContent	= value.substring(selectStart, selectEnd);
			const selectRight	= value.substring(selectEnd);
			if(!e.shiftKey){
				const replaceBefore	= selectContent.length;
				selectContent		= selectContent.replace(/\n/g, '\n\t');
				const replaceCount	= selectContent.length - replaceBefore;

				value			= selectLeft + '\t' + selectContent + selectRight;
				obj.value		= value;
				obj.selectionStart	= selectStart + 1;
				obj.selectionEnd	= selectEnd + 1 + replaceCount;
			}
			else{
				const replaceBefore	= selectContent.length;
				selectContent		= selectContent.replace(/\n\t/g, '\n');
				selectContent		= selectContent.replace(/^\t/g, '');
				const replaceCount	= replaceBefore - selectContent.length;

				value			= selectLeft + selectContent + selectRight;
				obj.value		= value;
				obj.selectionStart	= selectStart;
				obj.selectionEnd	= selectEnd - replaceCount;
			}
		}

		private static DumpCpuLog(cpu: Emulator.Cpu){
			for(let i = 0; i < cpu.Logs.length; i++){
				const instructionLog	= cpu.Logs[i];
				console.log(`[${i}] ${instructionLog.GetLogString()}`);
				for(let j = 0; j < instructionLog.AccessLog.length; j++){
					const accessLog	= instructionLog.AccessLog[j];
					console.log(`  [${Utility.Format.PadSpace(Emulator.AccessType[accessLog.Type], 12)}]`
						+ ` $${Utility.Format.ToHexString(accessLog.AddressBus, 6)} = $${Utility.Format.ToHexString(accessLog.DataBus, 2)}`
						+ ` @ ${Emulator.AccessSpeed[accessLog.Cycle]}`
					);
				}
			}
		}
	}

}

//--------------------------------------------------

// DEBUG
function CreateDebugObject(){
	const log: Emulator.StepLog = new Emulator.StepLog();
	log.Registers.SetStatusFlagE(false);	// to native mode
	//log.Registers.SetStatusFlagM(false);	// to m=8bit
	log.Operand1	= 0xBBAA;
	log.Operand2	= 0xCC;
	log.Instruction	= Emulator.Instruction.ADC;
	log.Addressing	= Emulator.Addressing.DirectpageIndirect;
	log.Registers.A	= 0x2211;
	log.Registers.X	= 0x4433;
	log.Registers.Y	= 0x6655;

	return log;
}

function DebugAsseble(){
	const code	= `
		.org	$008000	; code start
EmulationRST:
		SEI		; 78
		REP	#$CB	; C2 CB
		XCE		; FB
		SEP	#$34	; E2 34
		.m8
		.i8
		LDA.b	#$12	; A9 12
		LDA	#$1234	; A9 34
		REP	#$20	; C2 20
		.m16 .i8
-
-		LDA.b	#1234	; A9 D2
		LDA	#5678	; A9 2E 16
		BNE	-	; D0 F9
+
+		NOP		; EA
		BRA	+	; 80 00
+
+		BRL	-	; 82 F3 FF
;.Inf
.Inf		JMP	.Inf	; 4C 19 80
		JSR	Test	; 20 40 80
		JSL	Test	; 22 40 80 00
		.db	1, 2, $3, "ABC", Test	; 01 02 03 41 42 43 40
		.dw	1, 2, $3, "ABC", Test	; 01 00 02 00 03 00 41 00 42 00 43 00 40 80
		.dl	1, 2, $3, "ABC", Test	; 01 00 00 02 00 00 03 00 00 41 00 00 42 00 00 43 00 00 40 80 00
		.dd	1, 2, $3, "ABC", Test	; 01 00 00 00 02 00 00 00 03 00 00 00 41 00 00 00 42 00 00 00 43 00 00 00 40 80 00 00

		.org	$008040
Test:	.Start
;.Inf
.Inf		JML	.Inf	; 5C 40 80 00
		MVP	$7E, $7F; 44 7F 7E	; src, dst ($7F <- $7E)
+
		STP		; DB

		.i8
		LDX.b	#$1234	; A2 34
		LDX.w	#$5678	; A2 78 56
		LDX	#$ABCD	; A2 CD
		.i16
		LDX.b	#$1234	; A2 34
		LDX.w	#$5678	; A2 78 56
		LDX	#$ABCD	; A2 CD AB
		.i8
		LDX	#$1234	; A2 34

		.i8
		LDY.b	#$1234	; A0 34
		LDY.w	#$5678	; A0 78 56
		LDY	#$ABCD	; A0 CD
		.i16
		LDY.b	#$1234	; A0 34
		LDY.w	#$5678	; A0 78 56
		LDY	#$ABCD	; A0 CD AB
		.i8
		LDY	#$1234	; A0 34

		PEA	Test	; F4 40 80
		RTS		; 60

LabelA		= $0123
!LabelB		= $AABB
LabelC		= LabelA + 1
		LDA	LabelA		; AD 23 01
		STA	!LabelB		; 8D BB AA
		LDA	LabelC		; AD 24 01
		STA	!LabelB, X	; 9D BB AA

LabelOrigin	= $0189AB
		.org	LabelOrigin
		.dp	$0000
		ASL	A		; 0A
		ASL			; 0A
		ASL	$01		; 06 01
		LDA	$0100DD		; A5 DD
		LDA.b	$AABBCC		; A5 CC
		LDA.w	$AABBCC		; AD CC BB
		LDA.l	$AABBCC		; AF CC BB AA

		.org	$008080
		.dp	$0100
		LDA	$0000		; AD 00 00
		LDA	$00FF		; AD FF 00
		LDA	$0100		; A5 00
		LDA	$0101		; A5 01
		.dp	$0101
		LDA	$0000		; AD 00 00
		LDA	$00FF		; AD FF 00
		LDA	$0100		; AD 00 01
		LDA	$0101		; A5 00
		LDA	$0123		; A5 22
		LDA	#$0123		; A9 23 01
		.dp	$0000
		LDA	$0101		; AD 01 01

		.org	$009800
ResolveTest:
!offset		= 3
		NOP				; EA
-		.db	+			; 03
		.db	-			; 01
+		NOP				; EA
.L
		.db	1 + 1			; 02
		.db	1 << 4			; 10
		.db	.L			; 04
		.db	ResolveTest >> 8	; 98
		.db	+ + !offset		; 0C
+		.db	- + !offset		; 04

	`;
	Assembler.Assembler.Verbose	= true;
	const [assembled, errorMessage]	= Assembler.Assembler.Assemble(code);

	if(assembled !== null){
		console.log('%c' + (`----- Intel HEX ` + '-'.repeat(50)).substring(0, 50), 'background-color: silver');
		const records	= Assembler.HexFile.ChunksToIntelHex(assembled);
		let hexFile	= '';
		for(let i = 0; i < records.length; i++){
			hexFile	+= records[i] + '\n';
		}
		console.log(hexFile);
	}
	if(assembled !== null){
		console.log('%c' + (`----- SREC ` + '-'.repeat(50)).substring(0, 50), 'background-color: silver');
		const records	= Assembler.HexFile.ChunksToSRec(assembled);
		let hexFile	= '';
		for(let i = 0; i < records.length; i++){
			hexFile	+= records[i] + '\n';
		}
		console.log(hexFile);
	}
}

/*
function TestAddressConvert(){
	const skipPass		= false;

	const memoryLoRom	= new Emulator.Memory();
	memoryLoRom.ROMMapping	= Emulator.ROMMapping.LoROM;
	const memoryHiRom	= new Emulator.Memory();
	memoryHiRom.ROMMapping	= Emulator.ROMMapping.HiROM;

	let count	= 0;
	let passLo	= 0;
	let passHi	= 0;

	const toHex	= (value: number) => Utility.Format.ToHexString(value, 6);
	const pad	= (s: string, l: number) => (s + ' '.repeat(l)).substring(0, l);
	const getColor	= (b: boolean) => (b)? 'color: green' : 'color: maroon; background-color: pink;';

	const test	= (memory: Emulator.Memory, romType: string, input: number, expected: number): boolean => {
		const [region, actual]	= memory.ToRealAddress(input);
		const expectedStr	= (expected >= 0)? '$' + toHex(expected) : 'OpenBus';
		if(region !== Emulator.AccessRegion.OpenBus){
			const result		= (expected === actual);
			const color		= getColor(result);
			if(!skipPass || !result){
				console.log(`%c[${romType}: ${Utility.Format.PadNumber(count, 3)}] $${toHex(input)} => ${pad(Emulator.AccessRegion[region], 9)} $${toHex(actual)} (${expectedStr})`, color);
			}
			return result;
		}
		else{
			const result		= (expected < 0);
			const color		= getColor(result);
			if(!skipPass || !result){
				console.log(`%c[${romType}: ${Utility.Format.PadNumber(count, 3)}] $${toHex(input)} => ${pad(Emulator.AccessRegion[region], 9)} ------- (${expectedStr})`, color);
			}
			return result;
		}
	}
	const t		= (input: number, expectedLo: number, expectedHi: number) => {
		count++;

		if(test(memoryLoRom, 'Lo', input, expectedLo)){
			passLo++;
		}
		if(test(memoryHiRom, 'Hi', input, expectedHi)){
			passHi++;
		}
	}
	const s		= (bank: number) => {
		console.log('%c' + (`----- $${Utility.Format.ToHexString(bank, 2)} : ${count + 1} ` + '-'.repeat(50)).substring(0, 50), 'background-color: silver');
	}

	{
		{	s(0x00);
			t(0x000000, 0x7E0000, 0x7E0000);
			t(0x000001, 0x7E0001, 0x7E0001);
			t(0x001FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x001FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x002000, 0x002000, 0x002000);
			t(0x002001, 0x002001, 0x002001);
			t(0x004000, 0x004000, 0x004000);
			t(0x005FFF, 0x005FFF, 0x005FFF);
			t(0x006000,       -1,       -1);	// t(0x006000, 0x80E000, 0x306000);
			t(0x006001,       -1,       -1);	// t(0x006001, 0x80E001, 0x306001);
			t(0x007FFE,       -1,       -1);	// t(0x007FFE, 0x80FFFE, 0x307FFE);
			t(0x007FFF,       -1,       -1);	// t(0x007FFF, 0x80FFFF, 0x307FFF);
			t(0x008000, 0x808000, 0xC08000);
			t(0x008001, 0x808001, 0xC08001);
			t(0x00FFFE, 0x80FFFE, 0xC0FFFE);
			t(0x00FFFF, 0x80FFFF, 0xC0FFFF);
		}
		{	s(0x01);
			t(0x010000, 0x7E0000, 0x7E0000);
			t(0x010001, 0x7E0001, 0x7E0001);
			t(0x011FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x011FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x012000, 0x002000, 0x002000);
			t(0x012001, 0x002001, 0x002001);
			t(0x014000, 0x004000, 0x004000);
			t(0x015FFF, 0x005FFF, 0x005FFF);
			t(0x016000,       -1,       -1);	// t(0x016000, 0x81E000, 0x316000);
			t(0x016001,       -1,       -1);	// t(0x016001, 0x81E001, 0x316001);
			t(0x017FFE,       -1,       -1);	// t(0x017FFE, 0x81FFFE, 0x317FFE);
			t(0x017FFF,       -1,       -1);	// t(0x017FFF, 0x81FFFF, 0x317FFF);
			t(0x018000, 0x818000, 0xC18000);
			t(0x018001, 0x818001, 0xC18001);
			t(0x01FFFE, 0x81FFFE, 0xC1FFFE);
			t(0x01FFFF, 0x81FFFF, 0xC1FFFF);
		}
		{	s(0x0F);
			t(0x0F0000, 0x7E0000, 0x7E0000);
			t(0x0F0001, 0x7E0001, 0x7E0001);
			t(0x0F1FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x0F1FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x0F2000, 0x002000, 0x002000);
			t(0x0F2001, 0x002001, 0x002001);
			t(0x0F4000, 0x004000, 0x004000);
			t(0x0F5FFF, 0x005FFF, 0x005FFF);
			t(0x0F6000,       -1,       -1);	// t(0x0F6000, 0x8FE000, 0x3F6000);
			t(0x0F6001,       -1,       -1);	// t(0x0F6001, 0x8FE001, 0x3F6001);
			t(0x0F7FFE,       -1,       -1);	// t(0x0F7FFE, 0x8FFFFE, 0x3F7FFE);
			t(0x0F7FFF,       -1,       -1);	// t(0x0F7FFF, 0x8FFFFF, 0x3F7FFF);
			t(0x0F8000, 0x8F8000, 0xCF8000);
			t(0x0F8001, 0x8F8001, 0xCF8001);
			t(0x0FFFFE, 0x8FFFFE, 0xCFFFFE);
			t(0x0FFFFF, 0x8FFFFF, 0xCFFFFF);
		}
		{	s(0x10);
			t(0x100000, 0x7E0000, 0x7E0000);
			t(0x100001, 0x7E0001, 0x7E0001);
			t(0x101FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x101FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x102000, 0x002000, 0x002000);
			t(0x102001, 0x002001, 0x002001);
			t(0x104000, 0x004000, 0x004000);
			t(0x105FFF, 0x005FFF, 0x005FFF);
			t(0x106000,       -1, 0x306000);	// t(0x106000, 0x90E000, 0x306000);
			t(0x106001,       -1, 0x306001);	// t(0x106001, 0x90E001, 0x306001);
			t(0x107FFE,       -1, 0x307FFE);	// t(0x107FFE, 0x90FFFE, 0x307FFE);
			t(0x107FFF,       -1, 0x307FFF);	// t(0x107FFF, 0x90FFFF, 0x307FFF);
			t(0x108000, 0x908000, 0xD08000);
			t(0x108001, 0x908001, 0xD08001);
			t(0x10FFFE, 0x90FFFE, 0xD0FFFE);
			t(0x10FFFF, 0x90FFFF, 0xD0FFFF);
		}
		{	s(0x30);
			t(0x300000, 0x7E0000, 0x7E0000);
			t(0x300001, 0x7E0001, 0x7E0001);
			t(0x301FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x301FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x302000, 0x002000, 0x002000);
			t(0x302001, 0x002001, 0x002001);
			t(0x304000, 0x004000, 0x004000);
			t(0x305FFF, 0x005FFF, 0x005FFF);
			t(0x306000,       -1, 0x306000);	// t(0x306000, 0xB0E000, 0x306000);
			t(0x306001,       -1, 0x306001);	// t(0x306001, 0xB0E001, 0x306001);
			t(0x307FFE,       -1, 0x307FFE);	// t(0x307FFE, 0xB0FFFE, 0x307FFE);
			t(0x307FFF,       -1, 0x307FFF);	// t(0x307FFF, 0xB0FFFF, 0x307FFF);
			t(0x308000, 0xB08000, 0xF08000);
			t(0x308001, 0xB08001, 0xF08001);
			t(0x30FFFE, 0xB0FFFE, 0xF0FFFE);
			t(0x30FFFF, 0xB0FFFF, 0xF0FFFF);
		}
		{	s(0x3F);
			t(0x3F0000, 0x7E0000, 0x7E0000);
			t(0x3F0001, 0x7E0001, 0x7E0001);
			t(0x3F1FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x3F1FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x3F2000, 0x002000, 0x002000);
			t(0x3F2001, 0x002001, 0x002001);
			t(0x3F4000, 0x004000, 0x004000);
			t(0x3F5FFF, 0x005FFF, 0x005FFF);
			t(0x3F6000,       -1, 0x3F6000);	// t(0x3F6000, 0xBFE000, 0x3F6000);
			t(0x3F6001,       -1, 0x3F6001);	// t(0x3F6001, 0xBFE001, 0x3F6001);
			t(0x3F7FFE,       -1, 0x3F7FFE);	// t(0x3F7FFE, 0xBFFFFE, 0x3F7FFE);
			t(0x3F7FFF,       -1, 0x3F7FFF);	// t(0x3F7FFF, 0xBFFFFF, 0x3F7FFF);
			t(0x3F8000, 0xBF8000, 0xFF8000);
			t(0x3F8001, 0xBF8001, 0xFF8001);
			t(0x3FFFFE, 0xBFFFFE, 0xFFFFFE);
			t(0x3FFFFF, 0xBFFFFF, 0xFFFFFF);
		}
		{	s(0x40);
			t(0x400000, 0xC08000, 0xC00000);
			t(0x400001, 0xC08001, 0xC00001);
			t(0x401FFE, 0xC09FFE, 0xC01FFE);
			t(0x401FFF, 0xC09FFF, 0xC01FFF);
			t(0x402000, 0xC0A000, 0xC02000);
			t(0x402001, 0xC0A001, 0xC02001);
			t(0x404000, 0xC0C000, 0xC04000);
			t(0x405FFF, 0xC0DFFF, 0xC05FFF);
			t(0x406000, 0xC0E000, 0xC06000);
			t(0x406001, 0xC0E001, 0xC06001);
			t(0x407FFE, 0xC0FFFE, 0xC07FFE);
			t(0x407FFF, 0xC0FFFF, 0xC07FFF);
			t(0x408000, 0xC08000, 0xC08000);
			t(0x408001, 0xC08001, 0xC08001);
			t(0x40FFFE, 0xC0FFFE, 0xC0FFFE);
			t(0x40FFFF, 0xC0FFFF, 0xC0FFFF);
		}
		{	s(0x41);
			t(0x410000, 0xC18000, 0xC10000);
			t(0x410001, 0xC18001, 0xC10001);
			t(0x411FFE, 0xC19FFE, 0xC11FFE);
			t(0x411FFF, 0xC19FFF, 0xC11FFF);
			t(0x412000, 0xC1A000, 0xC12000);
			t(0x412001, 0xC1A001, 0xC12001);
			t(0x414000, 0xC1C000, 0xC14000);
			t(0x415FFF, 0xC1DFFF, 0xC15FFF);
			t(0x416000, 0xC1E000, 0xC16000);
			t(0x416001, 0xC1E001, 0xC16001);
			t(0x417FFE, 0xC1FFFE, 0xC17FFE);
			t(0x417FFF, 0xC1FFFF, 0xC17FFF);
			t(0x418000, 0xC18000, 0xC18000);
			t(0x418001, 0xC18001, 0xC18001);
			t(0x41FFFE, 0xC1FFFE, 0xC1FFFE);
			t(0x41FFFF, 0xC1FFFF, 0xC1FFFF);
		}
		{	s(0x70);
			t(0x700000, 0xF00000, 0xF00000);
			t(0x700001, 0xF00001, 0xF00001);
			t(0x701FFF, 0xF01FFF, 0xF01FFF);
			t(0x702000, 0xF02000, 0xF02000);
			t(0x707FFF, 0xF07FFF, 0xF07FFF);
			t(0x708000, 0xF08000, 0xF08000);
			t(0x70FFFF, 0xF0FFFF, 0xF0FFFF);

			t(0x710000, 0xF10000, 0xF10000);
			t(0x710001, 0xF10001, 0xF10001);
			t(0x711FFF, 0xF11FFF, 0xF11FFF);
			t(0x712000, 0xF12000, 0xF12000);
			t(0x717FFF, 0xF17FFF, 0xF17FFF);
			t(0x718000, 0xF18000, 0xF18000);
			t(0x71FFFF, 0xF1FFFF, 0xF1FFFF);

			t(0x7D0000, 0xFD0000, 0xFD0000);
			t(0x7D0001, 0xFD0001, 0xFD0001);
			t(0x7D1FFF, 0xFD1FFF, 0xFD1FFF);
			t(0x7D2000, 0xFD2000, 0xFD2000);
			t(0x7D7FFF, 0xFD7FFF, 0xFD7FFF);
			t(0x7D8000, 0xFD8000, 0xFD8000);
			t(0x7DFFFF, 0xFDFFFF, 0xFDFFFF);
		}
		{	s(0x7E);
			t(0x7E0000, 0x7E0000, 0x7E0000);
			t(0x7E0001, 0x7E0001, 0x7E0001);
			t(0x7E1FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x7E2000, 0x7E2000, 0x7E2000);
			t(0x7E8000, 0x7E8000, 0x7E8000);
			t(0x7EFFFF, 0x7EFFFF, 0x7EFFFF);
			t(0x7F0000, 0x7F0000, 0x7F0000);
			t(0x7F0001, 0x7F0001, 0x7F0001);
			t(0x7F1FFF, 0x7F1FFF, 0x7F1FFF);
			t(0x7F2000, 0x7F2000, 0x7F2000);
			t(0x7F8000, 0x7F8000, 0x7F8000);
			t(0x7FFFFF, 0x7FFFFF, 0x7FFFFF);
		}

		{	s(0x80);
			t(0x800000, 0x7E0000, 0x7E0000);
			t(0x800001, 0x7E0001, 0x7E0001);
			t(0x801FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x801FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x802000, 0x002000, 0x002000);
			t(0x802001, 0x002001, 0x002001);
			t(0x804000, 0x004000, 0x004000);
			t(0x805FFF, 0x005FFF, 0x005FFF);
			t(0x806000,       -1,       -1);	// t(0x806000, 0x80E000, 0x306000);
			t(0x806001,       -1,       -1);	// t(0x806001, 0x80E001, 0x306001);
			t(0x807FFE,       -1,       -1);	// t(0x807FFE, 0x80FFFE, 0x307FFE);
			t(0x807FFF,       -1,       -1);	// t(0x807FFF, 0x80FFFF, 0x307FFF);
			t(0x808000, 0x808000, 0xC08000);
			t(0x808001, 0x808001, 0xC08001);
			t(0x80FFFE, 0x80FFFE, 0xC0FFFE);
			t(0x80FFFF, 0x80FFFF, 0xC0FFFF);
		}
		{	s(0x81);
			t(0x810000, 0x7E0000, 0x7E0000);
			t(0x810001, 0x7E0001, 0x7E0001);
			t(0x811FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x811FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x812000, 0x002000, 0x002000);
			t(0x812001, 0x002001, 0x002001);
			t(0x814000, 0x004000, 0x004000);
			t(0x815FFF, 0x005FFF, 0x005FFF);
			t(0x816000,       -1,       -1);	// t(0x816000, 0x81E000, 0x316000);
			t(0x816001,       -1,       -1);	// t(0x816001, 0x81E001, 0x316001);
			t(0x817FFE,       -1,       -1);	// t(0x817FFE, 0x81FFFE, 0x317FFE);
			t(0x817FFF,       -1,       -1);	// t(0x817FFF, 0x81FFFF, 0x317FFF);
			t(0x818000, 0x818000, 0xC18000);
			t(0x818001, 0x818001, 0xC18001);
			t(0x81FFFE, 0x81FFFE, 0xC1FFFE);
			t(0x81FFFF, 0x81FFFF, 0xC1FFFF);
		}
		{	s(0x8F);
			t(0x8F0000, 0x7E0000, 0x7E0000);
			t(0x8F0001, 0x7E0001, 0x7E0001);
			t(0x8F1FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x8F1FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x8F2000, 0x002000, 0x002000);
			t(0x8F2001, 0x002001, 0x002001);
			t(0x8F4000, 0x004000, 0x004000);
			t(0x8F5FFF, 0x005FFF, 0x005FFF);
			t(0x8F6000,       -1,       -1);	// t(0x8F6000, 0x8FE000, 0x3F6000);
			t(0x8F6001,       -1,       -1);	// t(0x8F6001, 0x8FE001, 0x3F6001);
			t(0x8F7FFE,       -1,       -1);	// t(0x8F7FFE, 0x8FFFFE, 0x3F7FFE);
			t(0x8F7FFF,       -1,       -1);	// t(0x8F7FFF, 0x8FFFFF, 0x3F7FFF);
			t(0x8F8000, 0x8F8000, 0xCF8000);
			t(0x8F8001, 0x8F8001, 0xCF8001);
			t(0x8FFFFE, 0x8FFFFE, 0xCFFFFE);
			t(0x8FFFFF, 0x8FFFFF, 0xCFFFFF);
		}
		{	s(0x90);
			t(0x900000, 0x7E0000, 0x7E0000);
			t(0x900001, 0x7E0001, 0x7E0001);
			t(0x901FFE, 0x7E1FFE, 0x7E1FFE);
			t(0x901FFF, 0x7E1FFF, 0x7E1FFF);
			t(0x902000, 0x002000, 0x002000);
			t(0x902001, 0x002001, 0x002001);
			t(0x904000, 0x004000, 0x004000);
			t(0x905FFF, 0x005FFF, 0x005FFF);
			t(0x906000,       -1, 0x306000);	// t(0x906000, 0x90E000, 0x306000);
			t(0x906001,       -1, 0x306001);	// t(0x906001, 0x90E001, 0x306001);
			t(0x907FFE,       -1, 0x307FFE);	// t(0x907FFE, 0x90FFFE, 0x307FFE);
			t(0x907FFF,       -1, 0x307FFF);	// t(0x907FFF, 0x90FFFF, 0x307FFF);
			t(0x908000, 0x908000, 0xD08000);
			t(0x908001, 0x908001, 0xD08001);
			t(0x90FFFE, 0x90FFFE, 0xD0FFFE);
			t(0x90FFFF, 0x90FFFF, 0xD0FFFF);
		}
		{	s(0xB0);
			t(0xB00000, 0x7E0000, 0x7E0000);
			t(0xB00001, 0x7E0001, 0x7E0001);
			t(0xB01FFE, 0x7E1FFE, 0x7E1FFE);
			t(0xB01FFF, 0x7E1FFF, 0x7E1FFF);
			t(0xB02000, 0x002000, 0x002000);
			t(0xB02001, 0x002001, 0x002001);
			t(0xB04000, 0x004000, 0x004000);
			t(0xB05FFF, 0x005FFF, 0x005FFF);
			t(0xB06000,       -1, 0x306000);	// t(0xB06000, 0xB0E000, 0x306000);
			t(0xB06001,       -1, 0x306001);	// t(0xB06001, 0xB0E001, 0x306001);
			t(0xB07FFE,       -1, 0x307FFE);	// t(0xB07FFE, 0xB0FFFE, 0x307FFE);
			t(0xB07FFF,       -1, 0x307FFF);	// t(0xB07FFF, 0xB0FFFF, 0x307FFF);
			t(0xB08000, 0xB08000, 0xF08000);
			t(0xB08001, 0xB08001, 0xF08001);
			t(0xB0FFFE, 0xB0FFFE, 0xF0FFFE);
			t(0xB0FFFF, 0xB0FFFF, 0xF0FFFF);
		}
		{	s(0xBF);
			t(0xBF0000, 0x7E0000, 0x7E0000);
			t(0xBF0001, 0x7E0001, 0x7E0001);
			t(0xBF1FFE, 0x7E1FFE, 0x7E1FFE);
			t(0xBF1FFF, 0x7E1FFF, 0x7E1FFF);
			t(0xBF2000, 0x002000, 0x002000);
			t(0xBF2001, 0x002001, 0x002001);
			t(0xBF4000, 0x004000, 0x004000);
			t(0xBF5FFF, 0x005FFF, 0x005FFF);
			t(0xBF6000,       -1, 0x3F6000);	// t(0xBF6000, 0xBFE000, 0x3F6000);
			t(0xBF6001,       -1, 0x3F6001);	// t(0xBF6001, 0xBFE001, 0x3F6001);
			t(0xBF7FFE,       -1, 0x3F7FFE);	// t(0xBF7FFE, 0xBFFFFE, 0x3F7FFE);
			t(0xBF7FFF,       -1, 0x3F7FFF);	// t(0xBF7FFF, 0xBFFFFF, 0x3F7FFF);
			t(0xBF8000, 0xBF8000, 0xFF8000);
			t(0xBF8001, 0xBF8001, 0xFF8001);
			t(0xBFFFFE, 0xBFFFFE, 0xFFFFFE);
			t(0xBFFFFF, 0xBFFFFF, 0xFFFFFF);
		}
		{	s(0xC0);
			t(0xC00000, 0xC08000, 0xC00000);
			t(0xC00001, 0xC08001, 0xC00001);
			t(0xC01FFE, 0xC09FFE, 0xC01FFE);
			t(0xC01FFF, 0xC09FFF, 0xC01FFF);
			t(0xC02000, 0xC0A000, 0xC02000);
			t(0xC02001, 0xC0A001, 0xC02001);
			t(0xC04000, 0xC0C000, 0xC04000);
			t(0xC05FFF, 0xC0DFFF, 0xC05FFF);
			t(0xC06000, 0xC0E000, 0xC06000);
			t(0xC06001, 0xC0E001, 0xC06001);
			t(0xC07FFE, 0xC0FFFE, 0xC07FFE);
			t(0xC07FFF, 0xC0FFFF, 0xC07FFF);
			t(0xC08000, 0xC08000, 0xC08000);
			t(0xC08001, 0xC08001, 0xC08001);
			t(0xC0FFFE, 0xC0FFFE, 0xC0FFFE);
			t(0xC0FFFF, 0xC0FFFF, 0xC0FFFF);
		}
		{	s(0xC1);
			t(0xC10000, 0xC18000, 0xC10000);
			t(0xC10001, 0xC18001, 0xC10001);
			t(0xC11FFE, 0xC19FFE, 0xC11FFE);
			t(0xC11FFF, 0xC19FFF, 0xC11FFF);
			t(0xC12000, 0xC1A000, 0xC12000);
			t(0xC12001, 0xC1A001, 0xC12001);
			t(0xC14000, 0xC1C000, 0xC14000);
			t(0xC15FFF, 0xC1DFFF, 0xC15FFF);
			t(0xC16000, 0xC1E000, 0xC16000);
			t(0xC16001, 0xC1E001, 0xC16001);
			t(0xC17FFE, 0xC1FFFE, 0xC17FFE);
			t(0xC17FFF, 0xC1FFFF, 0xC17FFF);
			t(0xC18000, 0xC18000, 0xC18000);
			t(0xC18001, 0xC18001, 0xC18001);
			t(0xC1FFFE, 0xC1FFFE, 0xC1FFFE);
			t(0xC1FFFF, 0xC1FFFF, 0xC1FFFF);
		}
		{	s(0xF0);
			t(0xF00000, 0xF08000, 0xF00000);
			t(0xF00001, 0xF08001, 0xF00001);
			t(0xF01FFF, 0xF09FFF, 0xF01FFF);
			t(0xF02000, 0xF0A000, 0xF02000);
			t(0xF07FFF, 0xF0FFFF, 0xF07FFF);
			t(0xF08000, 0xF08000, 0xF08000);
			t(0xF0FFFF, 0xF0FFFF, 0xF0FFFF);

			t(0xF10000, 0xF18000, 0xF10000);
			t(0xF10001, 0xF18001, 0xF10001);
			t(0xF11FFF, 0xF19FFF, 0xF11FFF);
			t(0xF12000, 0xF1A000, 0xF12000);
			t(0xF17FFF, 0xF1FFFF, 0xF17FFF);
			t(0xF18000, 0xF18000, 0xF18000);
			t(0xF1FFFF, 0xF1FFFF, 0xF1FFFF);

			t(0xFD0000, 0xFD8000, 0xFD0000);
			t(0xFD0001, 0xFD8001, 0xFD0001);
			t(0xFD1FFF, 0xFD9FFF, 0xFD1FFF);
			t(0xFD2000, 0xFDA000, 0xFD2000);
			t(0xFD7FFF, 0xFDFFFF, 0xFD7FFF);
			t(0xFD8000, 0xFD8000, 0xFD8000);
			t(0xFDFFFF, 0xFDFFFF, 0xFDFFFF);
		}
		{	s(0xFE);
			t(0xFE0000, 0xFE8000, 0xFE0000);
			t(0xFE0001, 0xFE8001, 0xFE0001);
			t(0xFE1FFF, 0xFE9FFF, 0xFE1FFF);
			t(0xFE2000, 0xFEA000, 0xFE2000);
			t(0xFE8000, 0xFE8000, 0xFE8000);
			t(0xFEFFFF, 0xFEFFFF, 0xFEFFFF);
			t(0xFF0000, 0xFF8000, 0xFF0000);
			t(0xFF0001, 0xFF8001, 0xFF0001);
			t(0xFF1FFF, 0xFF9FFF, 0xFF1FFF);
			t(0xFF2000, 0xFFA000, 0xFF2000);
			t(0xFF8000, 0xFF8000, 0xFF8000);
			t(0xFFFFFF, 0xFFFFFF, 0xFFFFFF);
		}
	}

	console.log(`%cLo: ${passLo} / ${count}`, getColor(passLo === count));
	console.log(`%cHi: ${passHi} / ${count}`, getColor(passHi === count));
}
*/


