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
		public MasterCycleCounter: number	= 0;
		public CpuCycleCounter: number		= 0;
		public Logs: StepLog[]			= [];

		public CpuHalted			= false;
		private CpuSlept			= false;

		private PendingBoot: boolean		= true;
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
			this.PendingBoot		= true;
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
				this.PushResetEvent(this.PendingBoot);
				this.JumpInterruptHandler(InterruptType.EmulationRST);
				this.Reset();	// to override the program counter
				this.PendingBoot	= false;
				this.PendingRst		= false;
			}
			if(this.CpuHalted){
				return;
			}

			// TODO: Implement interrupts

			if(this.CpuSlept){
				return;
			}

			// Get next instruction
			if(this.yieldFunction === null){
				this.yieldFunction	= this.ExecuteInstruction();
			}
			const execute	= this.yieldFunction.next();
			if(execute.done){
				this.yieldFunction	= null;
				this.Memory.CpuStepIO();
			}

			this.Memory.ClockIO();
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
		private PushResetEvent(boot: boolean){
			const cpu	= this;
			const sp	= cpu.Registers.S;

			if(boot){
				cpu.Registers.SetRegisterS(cpu.Registers.S + 3);
			}

			function pushStack(value: number){
				value		= Utility.Type.ToByte(value);
				const address	= cpu.Registers.S;
				const result	= cpu.WriteDataByte(AccessType.PushStack, address, value);
				cpu.Registers.SetRegisterS(cpu.Registers.S - 1);
			}

			pushStack(cpu.Registers.PB);
			pushStack(cpu.Registers.PC >> 8);
			pushStack(cpu.Registers.PC);
			pushStack(cpu.Registers.P);

			if(boot){
				// Boot: $01FD
				cpu.Registers.SetRegisterS(sp);
			}
			else{
				// RST: SP - 3
				cpu.Registers.SetRegisterS(sp + 1);
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
			log.Source		= opcode[0].Source;
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
			function pushDummyAccess(accessType: AccessType, readAccess: boolean = true, writeAccess: boolean = false, offset:number = 0){
				// VDA = 0, VPA = 0
				const address	= (cpu.Memory.AddressBus & 0xFF0000) + Utility.Type.ToWord((cpu.Memory.AddressBus & 0x00FFFF) + offset);
				if(readAccess){
					const dummyAccess	= cpu.ReadDataByte(accessType, address);
					log.AccessLog.push({
						AddressBus: address,
						DataBus: cpu.Memory.DataBus,
						Region: dummyAccess[1].Region,
						Type: accessType,
						Cycle: AccessSpeed.Fast,
					});
				}
				if(writeAccess){
					const dummyAccess	= cpu.WriteDataByte(accessType, address, cpu.Memory.DataBus);
					log.AccessLog.push({
						AddressBus: address,
						DataBus: cpu.Memory.DataBus,
						Region: dummyAccess[1].Region,
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
					Region: result[1].Region,
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
					Region: result[1].Region,
					Type: result[1].Type,
					Cycle: result[1].Cycle,
				});
				return value;
			}
			function updateNZFlag(lengthFlag: boolean, value: number){
				value		= Utility.Type.ToWord(value);
				const msbMask	= (lengthFlag)? 0x0080 : 0x8000;
				const valueMask	= (lengthFlag)? 0x00FF : 0xFFFF;
				cpu.Registers.SetStatusFlagN((value & msbMask)   !== 0);
				cpu.Registers.SetStatusFlagZ((value & valueMask) === 0);
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
				const effectiveAddress		= cpu.Registers.ToDataAddress(operand1);

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
				const effectiveAddress		= cpu.Registers.ToProgramAddress(operand1);

				log.Addressing			= Addressing.AbsoluteJump;
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
				const effectiveAddress		= cpu.Registers.ToDataAddress(operand1);

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
			function *AddressingAbsIdxIdrX(pushPC: boolean){					// 02: (abs, x) (JMP, JSR)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				if(pushPC){
					const pushValue		= cpu.Registers.PC - 1;
					pushPushStack(pushValue >> 8);
					yield;

					pushPushStack(pushValue);
					yield;
				}

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const indirectAddress		= cpu.Registers.ToProgramAddress(operand1 + cpu.Registers.GetRegisterX());

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);
				const effectiveAddress		= cpu.Registers.ToProgramAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);

				log.Addressing			= Addressing.AbsoluteIndexedIndirect;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingAbsIdrJump(lengthFlag: boolean){					// 03: (abs) (JML, JMP)
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				const operand1			= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const indirectAddress		= operand1;

				const effectiveAddressLow	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
				log.AccessLog.push(effectiveAddressLow[1]);
				yield;
				const effectiveAddressHigh	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
				log.AccessLog.push(effectiveAddressHigh[1]);

				let effectiveAddress;
				if(!lengthFlag){
					yield;
					const effectiveAddressBank	= cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 2);
					log.AccessLog.push(effectiveAddressBank[1]);

					effectiveAddress	= (effectiveAddressBank[0].Data << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
				}
				else{
					effectiveAddress	= cpu.Registers.ToDataAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
				}

				log.Addressing			= (lengthFlag)? Addressing.AbsoluteIndirect : Addressing.AbsoluteIndirectLong;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingAbsLong(){								// 04a, 04b: long
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				yield;

				const operand1Bank		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Bank[1]);
				calculateInstructionLength();
				yield;

				const operand1			= (operand1Bank[0].Data << 16) | (operand1High[0].Data << 8) | (operand1Low[0].Data);

				log.Addressing			= Addressing.AbsoluteLong;
				log.Operand1			= operand1;
				log.EffectiveAddress		= operand1;

				yield* instructionFunction[1];
			}
			function *AddressingAbsLongJsl(){							// 04c: long (JSL)
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

				const effectiveAddressPage	= (operand1High[0].Data << 8) | (operand1Low[0].Data);
				const operand1			= (operand1Bank[0].Data << 16) | effectiveAddressPage;
				const effectiveAddress		= (operand1Bank[0].Data << 16) | Utility.Type.ToWord(effectiveAddressPage + cpu.Registers.GetRegisterX());

				log.Addressing			= Addressing.AbsoluteLongIndexedX;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

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
				const effectiveAddress		= cpu.Registers.ToDataAddress(baseAddress + cpu.Registers.GetRegisterX());
				const dummyAddress		= cpu.Registers.ToDataAddress((baseAddress & 0x00FF00) | (effectiveAddress & 0xFF));

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
				const effectiveAddress		= cpu.Registers.ToDataAddress(baseAddress + cpu.Registers.GetRegisterX());
				const dummyAddress		= cpu.Registers.ToDataAddress((baseAddress & 0x00FF00) | (effectiveAddress & 0xFF));

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
				const effectiveAddress		= cpu.Registers.ToDataAddress(baseAddress + cpu.Registers.GetRegisterY());
				const dummyAddress		= cpu.Registers.ToDataAddress((baseAddress & 0x00FF00) | (effectiveAddress & 0xFF));

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
			function *AddressingAccumulator(){							// 08: A
				calculateInstructionLength();

				pushDummyAccess(AccessType.ReadDummy, true, false, 1);	// read next pc

				log.Addressing			= Addressing.Accumulator;

				yield* instructionFunction[1];
			}
			function *AddressingXyc(){								// 09: xyc
				// destination
				const operand1Bank		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Bank[1]);
				yield;

				// source
				const operand2Bank		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand2Bank[1]);
				calculateInstructionLength();
				yield;

				const destinationAddress	= (operand1Bank[0].Data << 16) | cpu.Registers.GetRegisterY();
				const sourceAddress		= (operand2Bank[0].Data << 16) | cpu.Registers.GetRegisterX();
				const effectiveAddress		= sourceAddress;

				const readValue			= cpu.ReadDataByte(AccessType.Read, sourceAddress);
				log.AccessLog.push(readValue[1]);
				yield;

				const effectiveValue		= readValue[0].Data;
				const writeValue		= cpu.WriteDataByte(AccessType.Write, destinationAddress, effectiveValue);
				log.AccessLog.push(writeValue[1]);
				yield;

				cpu.Registers.DB		= operand1Bank[0].Data;

				log.Addressing			= Addressing.BlockMove;
				log.Operand1			= operand1Bank[0].Data;
				log.Operand2			= operand2Bank[0].Data;
				log.EffectiveAddress		= effectiveAddress;
				log.EffectiveValue		= effectiveValue;

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
				const effectiveAddress		= cpu.Registers.ToDataAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
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
				const effectiveAddress		= cpu.Registers.ToDataAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
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
				const effectiveAddress		= cpu.Registers.ToDataAddress(indirectBaseAddress +  cpu.Registers.GetRegisterY());
				const dummyAddress		= cpu.Registers.ToDataAddress((indirectBaseAddress & 0x00FF00) | (effectiveAddress & 0xFF));
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
				const effectiveAddressPage	= ((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data) + cpu.Registers.GetRegisterY();
				const effectiveAddress		= (effectiveAddressBank[0].Data << 16) | Utility.Type.ToWord(effectiveAddressPage);
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
			function *AddressingDpIdxY(){								// 17: dp, y
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
				const effectiveAddress		= cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterY());

				log.Addressing			= Addressing.DirectpageIndexedY;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingImmediate(addressing: Addressing, lengthFlag: boolean){		// 18: #imm
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);

				let operand1			= operand1Low[0].Data;
				if(!lengthFlag){
					yield;
					const operand1High	= cpu.FetchProgramByte(AccessType.FetchOperand);
					operand1		|= (operand1High[0].Data << 8);
					log.AccessLog.push(operand1High[1]);
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

				pushDummyAccess(AccessType.ReadDummy, true, false, 1);	// read next pc

				if(additionalWait){
					yield;
					pushDummyAccess(AccessType.ReadDummy);		// read next pc (incremented)
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
			function *AddressingRelLong(){								// 21: rlong
				const operand1Low		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1Low[1]);
				yield;

				const operand1High		= cpu.FetchProgramByte(AccessType.FetchOperand);
				log.AccessLog.push(operand1High[1]);
				calculateInstructionLength();
				yield;

				const operand1			= Utility.Type.ToShort((operand1High[0].Data << 8) | (operand1Low[0].Data));
				const effectiveAddress		= cpu.Registers.ToRelativeAddress(operand1);

				log.Addressing			= Addressing.RelativeLong;
				log.Operand1			= operand1;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
														// 22a: S (ABORT, IRQ, NMI, RES)
			function *AddressingStackPull(lengthFlag: boolean){					// 22b: S (PLA, PLB, PLD, PLP, PLX, PLY)
				calculateInstructionLength();

				pushDummyAccess(AccessType.ReadDummy, true, false, 1);	// read next pc
				yield;

				pushDummyAccess(AccessType.ReadDummy);			// read next pc (incremented)
				yield;

				const stackPointer		= cpu.Registers.S;
				const stackLow			= pushPullStack();
				let effectiveValue		= stackLow;
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

				pushDummyAccess(AccessType.ReadDummy, true, false, 1);	// read next pc
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
														// 22d: S (PEA) (-> abs)
														// 22e: S (PEI) (-> (dp))
														// 22f: S (PER) (-> rlong)
			function *AddressingStackReturnInterrupt(){						// 22g: S (RTI)
				calculateInstructionLength();

				pushDummyAccess(AccessType.ReadDummy, true, false, 1);	// read next pc
				yield;

				pushDummyAccess(AccessType.ReadDummy);			// read next pc (incremented)
				yield;

				const stackStatus		= pushPullStack();
				yield;
				const stackPCLow		= pushPullStack();
				yield;
				const stackPCHigh		= pushPullStack();

				let stackPCBank			= cpu.Registers.PB;
				if(!cpu.Registers.GetStatusFlagE()){
					yield;
					stackPCBank		= pushPullStack();
				}

				cpu.Registers.SetRegisterP(stackStatus);
				let effectiveAddress		= (stackPCBank << 16) | (stackPCHigh << 8) | stackPCLow;

				log.Addressing			= Addressing.Stack;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}
			function *AddressingStackReturn(lengthFlag: boolean){					// 22h, 22i: S (RTS, RTL)
				calculateInstructionLength();

				pushDummyAccess(AccessType.ReadDummy, true, false, 1);	// read next pc
				yield;

				pushDummyAccess(AccessType.ReadDummy);			// read next pc (incremented)
				yield;

				const stackPCLow		= pushPullStack();
				yield;
				const stackPCHigh		= pushPullStack();
				yield;

				let stackPCBank			= cpu.Registers.PB;
				if(lengthFlag){
					// RTS
					pushDummyAccess(AccessType.ReadDummy);
				}
				else{
					// RTL
					stackPCBank		= pushPullStack();
				}
				let effectiveAddress		= (stackPCBank << 16) | (stackPCHigh << 8) | stackPCLow;

				log.Addressing			= Addressing.Stack;
				log.EffectiveAddress		= effectiveAddress;

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
			function *AddressingStackRelIdrIdxY(){							// 24: (sr, S), Y
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
				const effectiveAddress		= cpu.Registers.ToDataAddress(effectiveAddressPage);

				log.Addressing			= Addressing.StackRelativeIndirectIndexedY;
				log.Operand1			= operand1;
				log.IndirectAddress		= indirectAddress;
				log.EffectiveAddress		= effectiveAddress;

				yield* instructionFunction[1];
			}

			// Instruction
			//--------------------------------------------------
			function *InstructionDummy(instruction: Instruction){
				log.Instruction			= instruction;
			}

			function *InstructionBlockMove(instruction: Instruction, direction: number){
				log.Instruction			= instruction;
				const revertAddress		= log.InstructionAddress;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				pushDummyAccess(AccessType.ReadDummy);

				// index register is affected by X flag
				cpu.Registers.SetRegisterX(cpu.Registers.GetRegisterX() + direction);
				cpu.Registers.SetRegisterY(cpu.Registers.GetRegisterY() + direction);

				// accumulator is not affected by M flag
				const length			= cpu.Registers.GetRegisterA(true) - 1;
				if(length >= 0){
					cpu.Registers.SetProgramCounter(revertAddress);
				}
				cpu.Registers.SetRegisterA(length, true);
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
			function *InstructionCompare(instruction: Instruction, operand1: number, operand2: number, lengthFlag: boolean){
				log.Instruction			= instruction;

				let result			= operand1 - operand2;

				const cFlag			= result >= 0;
				cpu.Registers.SetStatusFlagC(cFlag);
				updateNZFlag(lengthFlag, result);
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

				log.IndirectAddress		= fetchVector;
			}
			function *InstructionJump(instruction: Instruction, offset: number){
				log.Instruction			= instruction;

				const destinationBank		= log.EffectiveAddress & 0xFF0000;
				const destinationPage		= Utility.Type.ToWord((log.EffectiveAddress & 0x00FFFF) + offset);
				const destinationAddress	= destinationBank | destinationPage;

				cpu.Registers.SetFullProgramCounter(destinationAddress);
				log.EffectiveValue		= destinationAddress;
			}
			function *InstructionLoad(instruction: Instruction, imm: boolean, lengthFlag: boolean, destination: string){
				log.Instruction			= instruction;
				let readValue			= 0;

				if(imm){
					readValue		= log.Operand1;
				}
				else{
					const readValueLow		= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
					log.AccessLog.push(readValueLow[1]);
					readValue			= readValueLow[0].Data;

					if(!lengthFlag){
						yield;
						const readValueHigh	= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
						log.AccessLog.push(readValueHigh[1]);
						readValue		|= (readValueHigh[0].Data << 8);
					}
				}

				updateNZFlag(lengthFlag, readValue);
				cpu.Registers.SetRegisters({[destination]: readValue});

				log.EffectiveValue		= readValue;
			}
			function *InstructionPushValue(value: number, lengthFlag: boolean){
				if(!lengthFlag){
					pushPushStack(value >> 8);
					yield;
				}
				pushPushStack(value);
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
			function *InstructionStore(value: number, lengthFlag: boolean){
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 0, value);
				log.AccessLog.push(writeValueLow[1]);

				if(!lengthFlag){
					yield;
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 1, value >> 8);
					log.AccessLog.push(writeValueHigh[1]);
				}

				log.EffectiveValue		= value;
			}
			function *InstructionTxx(instruction: Instruction, sourceValue: number, destination: string, lengthFlag: boolean | null){
				log.Instruction			= instruction;

				cpu.Registers.SetRegisters({[destination]: sourceValue});
				if(lengthFlag !== null){
					updateNZFlag(lengthFlag, sourceValue);
				}
			}

			function *InstructionADC(imm: boolean = false){
				const operand1			= cpu.Registers.GetRegisterA();
				let operand2			= 0;

				if(imm){
					operand2		= log.Operand1;
				}
				else{
					const readValueLow		= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
					log.AccessLog.push(readValueLow[1]);
					operand2			= readValueLow[0].Data;

					if(!cpu.Registers.GetStatusFlagM()){
						yield;
						const readValueHigh	= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
						log.AccessLog.push(readValueHigh[1]);
						operand2		|= (readValueHigh[0].Data << 8);
					}
				}

				const valueMask			= cpu.Registers.GetMaskM();
				const msbMask			= cpu.Registers.GetMsbMaskM();
				const intCarry			= (cpu.Registers.GetStatusFlagC())? 1 : 0;
				let writeValue			= 0;
				let overflowResult		= 0;
				if(!cpu.Registers.GetStatusFlagD()){
					// binary
					writeValue		= operand1 + operand2 + intCarry;
					overflowResult		= writeValue;
				}
				else{
					// decimal
					let stepDigitMask	= 0x000F;
					let stepResultMask	= 0x000F;
					let stepCarry		= 0x000A;
					let stepAdd		= 0x0006;
					let carry		= intCarry;
					while(stepDigitMask < valueMask){
						let stepResult	= (operand1 & stepDigitMask) + (operand2 & stepDigitMask) + carry;
						overflowResult	= stepResult;
						if(stepResult >= stepCarry){
							stepResult	+= stepAdd;
						}
						if(stepResult >= stepResultMask){
							carry	= stepResultMask + 1;
						}
						else{
							carry	= 0;
						}

						writeValue	|= (stepResult & stepDigitMask);

						stepDigitMask	<<= 4;
						stepResultMask	= (stepResultMask << 4) | 0x000F;
						stepCarry	<<= 4;
						stepAdd		<<= 4;
					}
					writeValue		|= carry;
				}

				// update C flag
				const cFlag			= writeValue > valueMask;
				cpu.Registers.SetStatusFlagC(cFlag);

				// update V flag
				const signOperand1		= (operand1 & msbMask);
				const signOperand2		= (operand2 & msbMask);
				const signResult		= (overflowResult & msbMask);
				const vFlag			= (signOperand1 === signOperand2) && (signOperand1 !== signResult);
				cpu.Registers.SetStatusFlagV(vFlag);

				cpu.Registers.SetRegisterA(writeValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);

				log.Instruction			= Instruction.ADC;
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

				effectiveValue			&= readValue;
				cpu.Registers.SetRegisterA(effectiveValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);

				log.Instruction			= Instruction.AND;
			}
			function *InstructionASLRegister(instruction: Instruction, carry: boolean){
				const effectiveValue		= cpu.Registers.GetRegisterA();
				const intCarry			= (carry)? 1 : 0;
				let writeValue			= ((effectiveValue << 1) | intCarry) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);
				cpu.Registers.SetStatusFlagC((effectiveValue & cpu.Registers.GetMsbMaskM()) !== 0);

				cpu.Registers.SetRegisterA(writeValue);

				log.Instruction			= instruction;
			}
			function *InstructionASLMemory(instruction: Instruction, carry: boolean){
				const effectiveAddress		= log.EffectiveAddress;
				const effectiveValue		= log.EffectiveValue;
				const intCarry			= (carry)? 1 : 0;
				let writeValue			= ((effectiveValue << 1) | intCarry) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);
				cpu.Registers.SetStatusFlagC((effectiveValue & cpu.Registers.GetMsbMaskM()) !== 0);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction			= instruction;
			}
			function *InstructionBIT(imm: boolean = false){
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

				const result			= readValue & cpu.Registers.GetRegisterA();

				if(!imm){
					const nMask			= cpu.Registers.GetMsbMaskM();
					const vMask			= nMask >> 1;

					cpu.Registers.SetStatusFlagN((readValue & nMask) !== 0);
					cpu.Registers.SetStatusFlagV((readValue & vMask) !== 0);
				}
				cpu.Registers.SetStatusFlagZ(result === 0);

				log.Instruction			= Instruction.BIT;
			}
			function *InstructionBRK(){
				log.Instruction			= Instruction.BRK;
				yield* InstructionInterrupt(InterruptType.NativeBRK, InterruptType.EmulationIRQ);
			}
			function *InstructionBRL(){
				pushDummyAccess(AccessType.ReadDummy);

				const destinationAddress	= log.EffectiveAddress;
				cpu.Registers.SetFullProgramCounter(destinationAddress);

				log.Instruction			= Instruction.BRL;
				log.EffectiveValue		= destinationAddress;
			}
			function *InstructionCMP(imm: boolean = false){
				const operand1	= cpu.Registers.GetRegisterA();
				const operand2	= (imm)? log.Operand1 : log.EffectiveValue;
				yield* InstructionCompare(Instruction.CMP, operand1, operand2, cpu.Registers.GetStatusFlagM());
			}
			function *InstructionCPX(imm: boolean = false){
				const operand1	= cpu.Registers.GetRegisterX();
				const operand2	= (imm)? log.Operand1 : log.EffectiveValue;
				yield* InstructionCompare(Instruction.CPX, operand1, operand2, cpu.Registers.GetStatusFlagX());
			}
			function *InstructionCPY(imm: boolean = false){
				const operand1	= cpu.Registers.GetRegisterY();
				const operand2	= (imm)? log.Operand1 : log.EffectiveValue;
				yield* InstructionCompare(Instruction.CPY, operand1, operand2, cpu.Registers.GetStatusFlagX());
			}
			function *InstructionCOP(){
				log.Instruction			= Instruction.COP;
				yield* InstructionInterrupt(InterruptType.NativeCOP, InterruptType.EmulationCOP);
			}
			function *InstructionDECRegister(){
				const effectiveValue		= cpu.Registers.GetRegisterA() - 1;

				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
				cpu.Registers.SetRegisterA(effectiveValue);

				log.Instruction			= Instruction.DEC;
			}
			function *InstructionDECMemory(){
				const effectiveAddress		= log.EffectiveAddress;
				const effectiveValue		= log.EffectiveValue;
				let writeValue			= (effectiveValue - 1) & cpu.Registers.GetMaskM();
				updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction			= Instruction.DEC;
			}
			function *InstructionDEX(){
				const effectiveValue		= cpu.Registers.GetRegisterX() - 1;

				updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
				cpu.Registers.SetRegisterX(effectiveValue);

				log.Instruction			= Instruction.DEX;
			}
			function *InstructionDEY(){
				const effectiveValue		= cpu.Registers.GetRegisterY() - 1;

				updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
				cpu.Registers.SetRegisterY(effectiveValue);

				log.Instruction			= Instruction.DEY;
			}
			function *InstructionEOR(imm: boolean = false){
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

				effectiveValue			^= readValue;
				cpu.Registers.SetRegisterA(effectiveValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);

				log.Instruction			= Instruction.EOR;
			}
			function *InstructionINCRegister(){
				const effectiveValue		= cpu.Registers.GetRegisterA() + 1;

				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
				cpu.Registers.SetRegisterA(effectiveValue);

				log.Instruction			= Instruction.INC;
			}
			function *InstructionINCMemory(){
				const effectiveAddress		= log.EffectiveAddress;
				const effectiveValue		= log.EffectiveValue;
				let writeValue			= (effectiveValue + 1) & cpu.Registers.GetMaskM();
				updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction			= Instruction.INC;
			}
			function *InstructionINX(){
				const effectiveValue		= cpu.Registers.GetRegisterX() + 1;

				updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
				cpu.Registers.SetRegisterX(effectiveValue);

				log.Instruction			= Instruction.INX;
			}
			function *InstructionINY(){
				const effectiveValue		= cpu.Registers.GetRegisterY() + 1;

				updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
				cpu.Registers.SetRegisterY(effectiveValue);

				log.Instruction			= Instruction.INY;
			}
			function *InstructionJSR(instruction: Instruction, fullAddress: boolean){
				const jumpAddress		= log.Operand1;
				const pushValue			= cpu.Registers.PC - 1;

				pushPushStack(pushValue >> 8);
				yield;

				pushPushStack(pushValue);

				if(fullAddress){
					cpu.Registers.SetFullProgramCounter(jumpAddress);
				}
				else{
					cpu.Registers.SetProgramCounter(jumpAddress);
				}

				log.Instruction			= instruction;
			}
			function *InstructionLDA(imm: boolean = false){
				yield* InstructionLoad(Instruction.LDA, imm, cpu.Registers.GetStatusFlagM(), 'A');
			}
			function *InstructionLDX(imm: boolean = false){
				yield* InstructionLoad(Instruction.LDX, imm, cpu.Registers.GetStatusFlagX(), 'X');
			}
			function *InstructionLDY(imm: boolean = false){
				yield* InstructionLoad(Instruction.LDY, imm, cpu.Registers.GetStatusFlagX(), 'Y');
			}
			function *InstructionLSRRegister(instruction: Instruction, carry: boolean){
				const effectiveValue		= cpu.Registers.GetRegisterA();
				const intCarry			= (carry)? cpu.Registers.GetMsbMaskM() : 0;
				let writeValue			= ((effectiveValue >> 1) | intCarry) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);
				cpu.Registers.SetStatusFlagC((effectiveValue & 1                          ) !== 0);

				cpu.Registers.SetRegisterA(writeValue);

				log.Instruction			= instruction;
			}
			function *InstructionLSRMemory(instruction: Instruction, carry: boolean){
				const effectiveAddress		= log.EffectiveAddress;
				const effectiveValue		= log.EffectiveValue;
				const intCarry			= (carry)? cpu.Registers.GetMsbMaskM() : 0;
				let writeValue			= ((effectiveValue >> 1) | intCarry) & cpu.Registers.GetMaskM();
				cpu.Registers.SetStatusFlagN((writeValue     & cpu.Registers.GetMsbMaskM()) !== 0);
				cpu.Registers.SetStatusFlagZ((writeValue                                  ) === 0);
				cpu.Registers.SetStatusFlagC((effectiveValue & 1                          ) !== 0);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				log.Instruction			= instruction;
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

				effectiveValue			|= readValue;
				cpu.Registers.SetRegisterA(effectiveValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);

				log.Instruction			= Instruction.ORA;
			}
			function *InstructionPEA(){
				log.Instruction			= Instruction.PEA;
				log.EffectiveValue		= log.Operand1;

				yield* InstructionPushValue(log.Operand1, false);
			}
			function *InstructionPEI(){
				log.Instruction			= Instruction.PEI;
				log.EffectiveValue		= log.EffectiveAddress;

				yield* InstructionPushValue(log.EffectiveAddress, false);
			}
			function *InstructionPER(){
				log.Instruction			= Instruction.PER;
				log.EffectiveValue		= log.EffectiveAddress;

				pushDummyAccess(AccessType.ReadDummy);
				yield;

				yield* InstructionPushValue(log.EffectiveAddress, false);
			}
			function *InstructionREP(){
				log.Instruction			= Instruction.REP;

				yield;
				pushDummyAccess(AccessType.ReadDummy);

				const writeValue		= cpu.Registers.P & Utility.Type.ToByte(~log.Operand1);
				cpu.Registers.SetRegisterP(writeValue);
			}
			function *InstructionSBC(imm: boolean = false){
				const operand1			= cpu.Registers.GetRegisterA();
				let operand2			= 0;

				if(imm){
					operand2		= log.Operand1;
				}
				else{
					const readValueLow		= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
					log.AccessLog.push(readValueLow[1]);
					operand2			= readValueLow[0].Data;

					if(!cpu.Registers.GetStatusFlagM()){
						yield;
						const readValueHigh	= cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
						log.AccessLog.push(readValueHigh[1]);
						operand2		|= (readValueHigh[0].Data << 8);
					}
				}

				const valueMask			= cpu.Registers.GetMaskM();
				const msbMask			= cpu.Registers.GetMsbMaskM();
				const intCarry			= (cpu.Registers.GetStatusFlagC())? 1 : 0;
				let writeValue			= 0;
				let overflowResult		= 0;
				operand2			^= valueMask;
				if(!cpu.Registers.GetStatusFlagD()){
					// binary
					writeValue		= operand1 + operand2 + intCarry;
					overflowResult		= writeValue;
				}
				else{
					// decimal
					let stepDigitMask	= 0x000F;
					let stepResultMask	= 0x000F;
					let stepCarry		= 0x0010;
					let stepAdd		= 0x0006;
					let carry		= intCarry;
					while(stepDigitMask < valueMask){
						let stepResult	= (operand1 & stepDigitMask) + (operand2 & stepDigitMask) + carry;
						overflowResult	= stepResult;
						if(stepResult < stepCarry){
							stepResult	-= stepAdd;
						}
						if(stepResult >= stepResultMask){
							carry	= stepResultMask + 1;
						}
						else{
							carry	= 0;
						}

						writeValue	|= (stepResult & stepDigitMask);

						stepDigitMask	<<= 4;
						stepResultMask	= (stepResultMask << 4) | 0x000F;
						stepCarry	<<= 4;
						stepAdd		<<= 4;
					}
					writeValue		|= carry;
				}

				// update C flag
				const cFlag			= writeValue > valueMask;
				cpu.Registers.SetStatusFlagC(cFlag);

				// update V flag
				const signOperand1		= (operand1 & msbMask);
				const signOperand2		= (operand2 & msbMask);
				const signResult		= (overflowResult & msbMask);
				const vFlag			= (signOperand1 === signOperand2) && (signOperand1 !== signResult);
				cpu.Registers.SetStatusFlagV(vFlag);

				cpu.Registers.SetRegisterA(writeValue);
				updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);

				log.Instruction			= Instruction.SBC;
			}
			function *InstructionSEP(){
				log.Instruction			= Instruction.SEP;

				yield;
				pushDummyAccess(AccessType.ReadDummy);

				const writeValue		= cpu.Registers.P | log.Operand1;
				cpu.Registers.SetRegisterP(writeValue);
			}
			function *InstructionSTA(){
				log.Instruction			= Instruction.STA;
				yield* InstructionStore(cpu.Registers.GetRegisterA(), cpu.Registers.GetStatusFlagM());
			}
			function *InstructionSTP(){
				log.Instruction			= Instruction.STP;

				yield;
				pushDummyAccess(AccessType.ReadDummy);

				cpu.CpuHalted			= true;
			}
			function *InstructionSTX(){
				log.Instruction			= Instruction.STX;
				yield* InstructionStore(cpu.Registers.GetRegisterX(), cpu.Registers.GetStatusFlagX());
			}
			function *InstructionSTY(){
				log.Instruction			= Instruction.STY;
				yield* InstructionStore(cpu.Registers.GetRegisterY(), cpu.Registers.GetStatusFlagX());
			}
			function *InstructionSTZ(){
				let effectiveValue		= cpu.Registers.GetRegisterA();
				let readValue			= 0;

				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 0, 0);
				log.AccessLog.push(writeValueLow[1]);

				if(!cpu.Registers.GetStatusFlagM()){
					yield;
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 1, 0);
					log.AccessLog.push(writeValueHigh[1]);
				}

				log.Instruction			= Instruction.STZ;
				log.EffectiveValue		= 0;
			}
			function *InstructionTRB(){
				const effectiveAddress		= log.EffectiveAddress;
				const effectiveValue		= log.EffectiveValue;
				let writeValue			= cpu.Registers.GetRegisterA();
				cpu.Registers.SetStatusFlagZ((writeValue & effectiveValue) === 0);
				writeValue			= effectiveValue & Utility.Type.ToWord(~writeValue);

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				cpu.Registers.SetStatusFlagZ(writeValue === 0);

				log.Instruction			= Instruction.TRB;
			}
			function *InstructionTSB(){
				const effectiveAddress		= log.EffectiveAddress;
				const effectiveValue		= log.EffectiveValue;
				let writeValue			= cpu.Registers.GetRegisterA();
				cpu.Registers.SetStatusFlagZ((writeValue & effectiveValue) === 0);
				writeValue			|= effectiveValue;

				if(!cpu.Registers.GetStatusFlagM()){
					const writeValueHigh	= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
					log.AccessLog.push(writeValueHigh[1]);
					yield;
				}
				const writeValueLow		= cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
				log.AccessLog.push(writeValueLow[1]);

				cpu.Registers.SetStatusFlagZ(writeValue === 0);

				log.Instruction			= Instruction.TSB;
			}
			function *InstructionWAI(){
				log.Instruction			= Instruction.WAI;

				yield;
				pushDummyAccess(AccessType.ReadDummy);

				cpu.CpuSlept			= true;
			}
			function *InstructionXBA(){
				const effectiveValue		= cpu.Registers.GetRegisterA(true);
				const writeValue		= Utility.Type.ToWord(((effectiveValue >> 8) & 0x00FF) | ((effectiveValue << 8) & 0xFF00));

				updateNZFlag(true, writeValue);
				cpu.Registers.SetRegisterA(writeValue, true);

				log.Instruction			= Instruction.XBA;
				log.EffectiveValue		= effectiveValue;
			}
			function *InstructionXCE(){
				cpu.Registers.SwapStatusFlagCE();

				log.Instruction			= Instruction.XCE;
			}

			const regs	= cpu.Registers;
			const flagM	= cpu.Registers.GetStatusFlagM();
			const flagX	= cpu.Registers.GetStatusFlagX();
			const InstructionTable: Generator[][]	= [
				[AddressingStackInterrupt(0x30 /* nvRBdizc */),		InstructionBRK()							],	// 00: BRK #imm8
				[AddressingDpIdxIdrX(),					InstructionORA()							],	// 01: ORA (dp, X)
				[AddressingStackInterrupt(0x20 /* nvRbdizc */),		InstructionCOP()							],	// 02: COP #imm8
				[AddressingStackRel(),					InstructionORA()							],	// 03: ORA sr, S
				[AddressingDpRmw(),					InstructionTSB()							],	// 04: TSB dp
				[AddressingDp(),					InstructionORA()							],	// 05: ORA dp
				[AddressingDpRmw(),					InstructionASLMemory(Instruction.ASL, false)				],	// 06: ASL dp
				[AddressingDpIdrLong(),					InstructionORA()							],	// 07: ORA [dp]
				[AddressingStackPush(regs.P, true),			InstructionDummy(Instruction.PHP)					],	// 08: PHP S
				[AddressingImmediateMemory(),				InstructionORA(true)							],	// 09: ORA #immM
				[AddressingAccumulator(),				InstructionASLRegister(Instruction.ASL, false)				],	// 0A: ASL A
				[AddressingStackPush(regs.D, false),			InstructionDummy(Instruction.PHD)					],	// 0B: PHD S
				[AddressingAbsRmw(),					InstructionTSB()							],	// 0C: TSB abs
				[AddressingAbsDbr(),					InstructionORA()							],	// 0D: ORA abs
				[AddressingAbsRmw(),					InstructionASLMemory(Instruction.ASL, false)				],	// 0E: ASL abs
				[AddressingAbsLong(),					InstructionORA()							],	// 0F: ORA long
				[AddressingRel(),					InstructionBranch(Instruction.BPL, !regs.GetStatusFlagN())		],	// 10: BPL rel
				[AddressingDpIdrIdxY(false),				InstructionORA()							],	// 11: ORA (dp), Y
				[AddressingDpIdr(),					InstructionORA()							],	// 12: ORA (dp)
				[AddressingStackRelIdrIdxY(),				InstructionORA()							],	// 13: ORA (sr, S), Y
				[AddressingDpRmw(),					InstructionTRB()							],	// 14: TRB dp
				[AddressingDpIdxX(),					InstructionORA()							],	// 15: ORA dp, X
				[AddressingDpIdxXRmw(),					InstructionASLMemory(Instruction.ASL, false)				],	// 16: ASL dp, X
				[AddressingDpIdrLongIdxY(),				InstructionORA()							],	// 17: ORA [dp], Y
				[AddressingImplied(),					InstructionClearFlag(Instruction.CLC, 0x01 /* nvmxdizC */)		],	// 18: CLC
				[AddressingAbsIdxY(false),				InstructionORA()							],	// 19: ORA abs, Y
				[AddressingAccumulator(),				InstructionINCRegister()						],	// 1A: INC A
				[AddressingImplied(),					InstructionTxx(Instruction.TCS, regs.GetRegisterA(true), 'S', null)	],	// 1B: TCS
				[AddressingAbsRmw(),					InstructionTRB()							],	// 1C: TRB abs
				[AddressingAbsIdxX(false),				InstructionORA()							],	// 1D: ORA abs, X
				[AddressingAbsIdxXRmw(),				InstructionASLMemory(Instruction.ASL, false)				],	// 1E: ASL abs, X
				[AddressingLongIdxX(),					InstructionORA()							],	// 1F: ORA long, X
				[AddressingAbsPbr(true),				InstructionJSR(Instruction.JSR, false)					],	// 20: JSR abs
				[AddressingDpIdxIdrX(),					InstructionAND()							],	// 21: AND (dp, X)
				[AddressingAbsLongJsl(),				InstructionJSR(Instruction.JSL, true)					],	// 22: JSL long
				[AddressingStackRel(),					InstructionAND()							],	// 23: AND sr, S
				[AddressingDp(),					InstructionBIT()							],	// 24: BIT dp
				[AddressingDp(),					InstructionAND()							],	// 25: AND dp
				[AddressingDpRmw(),					InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())		],	// 26: ROL dp
				[AddressingDpIdrLong(),					InstructionAND()							],	// 27: AND [dp]
				[AddressingStackPull(true),				InstructionSetRegister(Instruction.PLP, 'P')				],	// 28: PLP S
				[AddressingImmediateMemory(),				InstructionAND(true)							],	// 29: AND #immM
				[AddressingAccumulator(),				InstructionASLRegister(Instruction.ROL, regs.GetStatusFlagC())		],	// 2A: ROL A
				[AddressingStackPull(false),				InstructionSetRegister(Instruction.PLD, 'D')				],	// 2B: PLD S
				[AddressingAbsDbr(),					InstructionBIT()							],	// 2C: BIT abs
				[AddressingAbsDbr(),					InstructionAND()							],	// 2D: AND abs
				[AddressingAbsRmw(),					InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())		],	// 2E: ROL abs
				[AddressingAbsLong(),					InstructionAND()							],	// 2F: AND long
				[AddressingRel(),					InstructionBranch(Instruction.BMI, regs.GetStatusFlagN())		],	// 30: BMI rel
				[AddressingDpIdrIdxY(false),				InstructionAND()							],	// 31: AND (dp), Y
				[AddressingDpIdr(),					InstructionAND()							],	// 32: AND (dp)
				[AddressingStackRelIdrIdxY(),				InstructionAND()							],	// 33: AND (sr, S), Y
				[AddressingDpRmw(),					InstructionBIT()							],	// 34: BIT dp
				[AddressingDpIdxX(),					InstructionAND()							],	// 35: AND dp, X
				[AddressingDpIdxXRmw(),					InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())		],	// 36: ROL dp, X
				[AddressingDpIdrLongIdxY(),				InstructionAND()							],	// 37: AND [dp], Y
				[AddressingImplied(),					InstructionSetFlag(Instruction.SEC, 0x01 /* nvmxdizC */)		],	// 38: SEC
				[AddressingAbsIdxY(false),				InstructionAND()							],	// 39: AND abs, Y
				[AddressingAccumulator(),				InstructionDECRegister()						],	// 3A: DEC A
				[AddressingImplied(),					InstructionTxx(Instruction.TSC, regs.S, 'C', false)			],	// 3B: TSC
				[AddressingAbsRmw(),					InstructionBIT()							],	// 3C: BIT abs
				[AddressingAbsIdxX(false),				InstructionAND()							],	// 3D: AND abs, X
				[AddressingAbsIdxXRmw(),				InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())		],	// 3E: ROL abs, X
				[AddressingLongIdxX(),					InstructionAND()							],	// 3F: AND long, X
				[AddressingStackReturnInterrupt(),			InstructionJump(Instruction.RTI, 0)					],	// 40: RTI S
				[AddressingDpIdxIdrX(),					InstructionEOR()							],	// 41: EOR (dp, X)
				[AddressingImmediateImm8(),				InstructionDummy(Instruction.WDM)					],	// 42: WDM #imm8
				[AddressingStackRel(),					InstructionEOR()							],	// 43: EOR sr, S
				[AddressingXyc(),					InstructionBlockMove(Instruction.MVP, 1)				],	// 44: MVP xyc
				[AddressingDp(),					InstructionEOR()							],	// 45: EOR dp
				[AddressingDpRmw(),					InstructionLSRMemory(Instruction.LSR, false)				],	// 46: LSR dp
				[AddressingDpIdrLong(),					InstructionEOR()							],	// 47: EOR [dp]
				[AddressingStackPush(regs.GetRegisterA(), flagM),	InstructionDummy(Instruction.PHA)					],	// 48: PHA S
				[AddressingImmediateMemory(),				InstructionEOR(true)							],	// 49: EOR #immM
				[AddressingAccumulator(),				InstructionLSRRegister(Instruction.LSR, false)				],	// 4A: LSR A
				[AddressingStackPush(regs.PB, true),			InstructionDummy(Instruction.PHK)					],	// 4B: PHK S
				[AddressingAbsPbr(false),				InstructionJump(Instruction.JMP, 0)					],	// 4C: JMP abs
				[AddressingAbsDbr(),					InstructionEOR()							],	// 4D: EOR abs
				[AddressingAbsRmw(),					InstructionLSRMemory(Instruction.LSR, false)				],	// 4E: LSR abs
				[AddressingAbsLong(),					InstructionEOR()							],	// 4F: EOR long
				[AddressingRel(),					InstructionBranch(Instruction.BVC, !regs.GetStatusFlagV())		],	// 50: BVC rel
				[AddressingDpIdrIdxY(false),				InstructionEOR()							],	// 51: EOR (dp), Y
				[AddressingDpIdr(),					InstructionEOR()							],	// 52: EOR (dp)
				[AddressingStackRelIdrIdxY(),				InstructionEOR()							],	// 53: EOR (sr, S), Y
				[AddressingXyc(),					InstructionBlockMove(Instruction.MVN, -1)				],	// 54: MVN xyc
				[AddressingDpIdxX(),					InstructionEOR()							],	// 55: EOR dp, X
				[AddressingDpIdxXRmw(),					InstructionLSRMemory(Instruction.LSR, false)				],	// 56: LSR dp, X
				[AddressingDpIdrLongIdxY(),				InstructionEOR()							],	// 57: EOR [dp], Y
				[AddressingImplied(),					InstructionClearFlag(Instruction.CLI, 0x04 /* nvmxdIzc */)		],	// 58: CLI
				[AddressingAbsIdxY(false),				InstructionEOR()							],	// 59: EOR abs, Y
				[AddressingStackPush(regs.GetRegisterY(), flagX),	InstructionDummy(Instruction.PHY)					],	// 5A: PHY S
				[AddressingImplied(),					InstructionTxx(Instruction.TCD, regs.GetRegisterA(true), 'D', false)	],	// 5B: TCD
				[AddressingAbsLong(),					InstructionJump(Instruction.JML, 0)					],	// 5C: JML long
				[AddressingAbsIdxX(false),				InstructionEOR()							],	// 5D: EOR abs, X
				[AddressingAbsIdxXRmw(),				InstructionLSRMemory(Instruction.LSR, false)				],	// 5E: LSR abs, X
				[AddressingLongIdxX(),					InstructionEOR()							],	// 5F: EOR long, X
				[AddressingStackReturn(true),				InstructionJump(Instruction.RTS, 1)					],	// 60: RTS S
				[AddressingDpIdxIdrX(),					InstructionADC()							],	// 61: ADC (dp, X)
				[AddressingRelLong(),					InstructionPER()							],	// 62: PER rlong
				[AddressingStackRel(),					InstructionADC()							],	// 63: ADC sr, S
				[AddressingDp(),					InstructionSTZ()							],	// 64: STZ dp
				[AddressingDp(),					InstructionADC()							],	// 65: ADC dp
				[AddressingDpRmw(),					InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())		],	// 66: ROR dp
				[AddressingDpIdrLong(),					InstructionADC()							],	// 67: ADC [dp]
				[AddressingStackPull(flagM),				InstructionSetRegister(Instruction.PLA, 'A')				],	// 68: PLA S
				[AddressingImmediateMemory(),				InstructionADC(true)							],	// 69: ADC #immM
				[AddressingAccumulator(),				InstructionLSRRegister(Instruction.ROR, regs.GetStatusFlagC())		],	// 6A: ROR A
				[AddressingStackReturn(false),				InstructionJump(Instruction.RTL, 1)					],	// 6B: RTL S
				[AddressingAbsIdrJump(true),				InstructionJump(Instruction.JMP, 0)					],	// 6C: JMP (abs)
				[AddressingAbsDbr(),					InstructionADC()							],	// 6D: ADC abs
				[AddressingAbsRmw(),					InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())		],	// 6E: ROR abs
				[AddressingAbsLong(),					InstructionADC()							],	// 6F: ADC long
				[AddressingRel(),					InstructionBranch(Instruction.BVC, regs.GetStatusFlagV())		],	// 70: BVS rel
				[AddressingDpIdrIdxY(false),				InstructionADC()							],	// 71: ADC (dp), Y
				[AddressingDpIdr(),					InstructionADC()							],	// 72: ADC (dp)
				[AddressingStackRelIdrIdxY(),				InstructionADC()							],	// 73: ADC (sr, S), Y
				[AddressingDpIdxX(),					InstructionSTZ()							],	// 74: STZ dp, X
				[AddressingDpIdxX(),					InstructionADC()							],	// 75: ADC dp, X
				[AddressingDpIdxXRmw(),					InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())		],	// 76: ROR dp, X
				[AddressingDpIdrLongIdxY(),				InstructionADC()							],	// 77: ADC [dp], Y
				[AddressingImplied(),					InstructionSetFlag(Instruction.SEI, 0x04 /* nvmxdIzc */)		],	// 78: SEI
				[AddressingAbsIdxY(false),				InstructionADC()							],	// 79: ADC abs, Y
				[AddressingStackPull(flagX),				InstructionSetRegister(Instruction.PLY, 'Y')				],	// 7A: PLY S
				[AddressingImplied(),					InstructionTxx(Instruction.TDC, regs.D, 'C', false)			],	// 7B: TDC
				[AddressingAbsIdxIdrX(false),				InstructionJump(Instruction.JMP, 0)					],	// 7C: JMP (abs. X)
				[AddressingAbsIdxX(false),				InstructionADC()							],	// 7D: ADC abs, X
				[AddressingAbsIdxXRmw(),				InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())		],	// 7E: ROR abs, X
				[AddressingLongIdxX(),					InstructionADC()							],	// 7F: ADC long, X
				[AddressingRel(),					InstructionBranch(Instruction.BRA, true)				],	// 80: BRA rel
				[AddressingDpIdxIdrX(),					InstructionSTA()							],	// 81: STA (dp, X)
				[AddressingRelLong(),					InstructionBRL()							],	// 82: BRL rlong
				[AddressingStackRel(),					InstructionSTA()							],	// 83: STA sr, S
				[AddressingDp(),					InstructionSTY()							],	// 84: STY dp
				[AddressingDp(),					InstructionSTA()							],	// 85: STA dp
				[AddressingDp(),					InstructionSTX()							],	// 86: STX dp
				[AddressingDpIdrLong(),					InstructionSTA()							],	// 87: STA [dp]
				[AddressingImplied(),					InstructionDEY()							],	// 88: DEY
				[AddressingImmediateMemory(),				InstructionBIT(true)							],	// 89: BIT #immM
				[AddressingImplied(),					InstructionTxx(Instruction.TXA, regs.GetRegisterX(), 'A', flagM)	],	// 8A: TXA
				[AddressingStackPush(regs.PB, true),			InstructionDummy(Instruction.PHB)					],	// 8B: PHB S
				[AddressingAbsDbr(),					InstructionSTY()							],	// 8C: STY abs
				[AddressingAbsDbr(),					InstructionSTA()							],	// 8D: STA abs
				[AddressingAbsDbr(),					InstructionSTX()							],	// 8E: STX abs
				[AddressingAbsLong(),					InstructionSTA()							],	// 8F: STA long
				[AddressingRel(),					InstructionBranch(Instruction.BCC, !regs.GetStatusFlagC())		],	// 90: BCC rel
				[AddressingDpIdrIdxY(true),				InstructionSTA()							],	// 91: STA (dp), Y
				[AddressingDpIdr(),					InstructionSTA()							],	// 92: STA (dp)
				[AddressingStackRelIdrIdxY(),				InstructionSTA()							],	// 93: STA (sr, S), Y
				[AddressingDpIdxX(),					InstructionSTY()							],	// 94: STY dp, X
				[AddressingDpIdxX(),					InstructionSTA()							],	// 95: STA dp, X
				[AddressingDpIdxX(),					InstructionSTX()							],	// 96: STX dp, X
				[AddressingDpIdrLongIdxY(),				InstructionSTA()							],	// 97: STA [dp], Y
				[AddressingImplied(),					InstructionTxx(Instruction.TYA, regs.GetRegisterY(), 'A', flagM)	],	// 98: TYA
				[AddressingAbsIdxY(true),				InstructionSTA()							],	// 99: STA abs, Y
				[AddressingImplied(),					InstructionTxx(Instruction.TXS, regs.GetRegisterX(), 'S', null)		],	// 9A: TXS
				[AddressingImplied(),					InstructionTxx(Instruction.TXY, regs.GetRegisterX(), 'Y', flagX)	],	// 9B: TXY
				[AddressingAbsDbr(),					InstructionSTZ()							],	// 9C: STZ abs
				[AddressingAbsIdxX(true),				InstructionSTA()							],	// 9D: STA abs, X
				[AddressingAbsIdxX(true),				InstructionSTZ()							],	// 9E: STZ abs, X
				[AddressingLongIdxX(),					InstructionSTA()							],	// 9F: STA long, X
				[AddressingImmediateIndex(),				InstructionLDY(true)							],	// A0: LDY #immX
				[AddressingDpIdxIdrX(),					InstructionLDA()							],	// A1: LDA (dp, X)
				[AddressingImmediateIndex(),				InstructionLDX(true)							],	// A2: LDX #immX
				[AddressingStackRel(),					InstructionLDA()							],	// A3: LDA sr, S
				[AddressingDp(),					InstructionLDY()							],	// A4: LDY dp
				[AddressingDp(),					InstructionLDA()							],	// A5: LDA dp
				[AddressingDp(),					InstructionLDX()							],	// A6: LDX dp
				[AddressingDpIdrLong(),					InstructionLDA()							],	// A7: LDA [dp]
				[AddressingImplied(),					InstructionTxx(Instruction.TAY, regs.GetRegisterA(true), 'Y', flagX)	],	// A8: TAY
				[AddressingImmediateMemory(),				InstructionLDA(true)							],	// A9: LDA #immM
				[AddressingImplied(),					InstructionTxx(Instruction.TAX, regs.GetRegisterA(true), 'X', flagX)	],	// AA: TAX
				[AddressingStackPull(true),				InstructionSetRegister(Instruction.PLB, 'PB')				],	// AB: PLB S
				[AddressingAbsDbr(),					InstructionLDY()							],	// AC: LDY abs
				[AddressingAbsDbr(),					InstructionLDA()							],	// AD: LDA abs
				[AddressingAbsDbr(),					InstructionLDX()							],	// AE: LDX abs
				[AddressingAbsLong(),					InstructionLDA()							],	// AF: LDA long
				[AddressingRel(),					InstructionBranch(Instruction.BCS, regs.GetStatusFlagC())		],	// B0: BCS rel
				[AddressingDpIdrIdxY(false),				InstructionLDA()							],	// B1: LDA (dp), Y
				[AddressingDpIdr(),					InstructionLDA()							],	// B2: LDA (dp)
				[AddressingStackRelIdrIdxY(),				InstructionLDA()							],	// B3: LDA (sr, S), Y
				[AddressingDpIdxX(),					InstructionSTY()							],	// B4: LDY dp, X
				[AddressingDpIdxX(),					InstructionLDA()							],	// B5: LDA dp, X
				[AddressingDpIdxY(),					InstructionLDX()							],	// B6: LDX dp, Y
				[AddressingDpIdrLongIdxY(),				InstructionLDA()							],	// B7: LDA [dp], Y
				[AddressingImplied(),					InstructionClearFlag(Instruction.CLV, 0x40 /* nVmxdizc */)		],	// B8: CLV
				[AddressingAbsIdxY(false),				InstructionLDA()							],	// B9: LDA abs, Y
				[AddressingImplied(),					InstructionTxx(Instruction.TSX, regs.S, 'X', flagX)			],	// BA: TSX
				[AddressingImplied(),					InstructionTxx(Instruction.TXY, regs.GetRegisterY(), 'X', flagX)	],	// BB: TYX
				[AddressingAbsDbr(),					InstructionLDY()							],	// BC: LDY abs, X
				[AddressingAbsIdxX(false),				InstructionLDA()							],	// BD: LDA abs, X
				[AddressingAbsIdxY(false),				InstructionLDX()							],	// BE: LDX abs, Y
				[AddressingLongIdxX(),					InstructionLDA()							],	// BF: LDA long, X
				[AddressingImmediateIndex(),				InstructionCPY(true)							],	// C0: CPY #immX
				[AddressingDpIdxIdrX(),					InstructionCMP()							],	// C1: CMP (dp, X)
				[AddressingImmediateImm8(),				InstructionREP()							],	// C2: REP #imm8
				[AddressingStackRel(),					InstructionCMP()							],	// C3: CMP sr, S
				[AddressingDp(),					InstructionCPY()							],	// C4: CPY dp
				[AddressingDp(),					InstructionCMP()							],	// C5: CMP dp
				[AddressingDpRmw(),					InstructionDECMemory()							],	// C6: DEC dp
				[AddressingDpIdrLong(),					InstructionCMP()							],	// C7: CMP [dp]
				[AddressingImplied(),					InstructionINY()							],	// C8: INY
				[AddressingImmediateMemory(),				InstructionCMP(true)							],	// C9: CMP #immM
				[AddressingImplied(),					InstructionDEX()							],	// CA: DEX
				[AddressingImplied(),					InstructionWAI()							],	// CB: WAI
				[AddressingAbsDbr(),					InstructionCPY()							],	// CC: CPY abs
				[AddressingAbsDbr(),					InstructionCMP()							],	// CD: CMP abs
				[AddressingAbsRmw(),					InstructionDECMemory()							],	// CE: DEC abs
				[AddressingAbsLong(),					InstructionCMP()							],	// CF: CMP long
				[AddressingRel(),					InstructionBranch(Instruction.BNE, !regs.GetStatusFlagZ())		],	// D0: BNE rel
				[AddressingDpIdrIdxY(false),				InstructionCMP()							],	// D1: CMP (dp), Y
				[AddressingDpIdr(),					InstructionCMP()							],	// D2: CMP (dp)
				[AddressingStackRelIdrIdxY(),				InstructionCMP()							],	// D3: CMP (sr, S), Y
				[AddressingDpIdr(),					InstructionPEI()							],	// D4: PEI (dp)
				[AddressingDpIdxX(),					InstructionCMP()							],	// D5: CMP dp, X
				[AddressingDpIdxY(),					InstructionDECMemory()							],	// D6: DEC dp, Y
				[AddressingDpIdrLongIdxY(),				InstructionCMP()							],	// D7: CMP [dp], Y
				[AddressingImplied(),					InstructionClearFlag(Instruction.CLD, 0x08 /* nvmxDizc */)		],	// D8: CLD
				[AddressingAbsIdxY(false),				InstructionCMP()							],	// D9: CMP abs, Y
				[AddressingStackPush(regs.GetRegisterX(), flagX),	InstructionDummy(Instruction.PHX)					],	// DA: PHX
				[AddressingImplied(),					InstructionSTP()							],	// DB: STP
				[AddressingAbsIdrJump(false),				InstructionJump(Instruction.JML, 0)					],	// DC: JML [abs]
				[AddressingAbsIdxX(false),				InstructionCMP()							],	// DD: CMP abs, X
				[AddressingAbsIdxX(false),				InstructionDECMemory()							],	// DE: DEC abs, X
				[AddressingLongIdxX(),					InstructionCMP()							],	// DF: CMP long, X
				[AddressingImmediateIndex(),				InstructionCPX(true)							],	// E0: CPX #immX
				[AddressingDpIdxIdrX(),					InstructionSBC()							],	// E1: SBC (dp, X)
				[AddressingImmediateImm8(),				InstructionSEP()							],	// E2: SEP #imm8
				[AddressingStackRel(),					InstructionSBC()							],	// E3: SBC sr, S
				[AddressingDp(),					InstructionCPX()							],	// E4: CPX dp
				[AddressingDp(),					InstructionSBC()							],	// E5: SBC dp
				[AddressingDpRmw(),					InstructionINCMemory()							],	// E6: INC dp
				[AddressingDpIdrLong(),					InstructionSBC()							],	// E7: SBC [dp]
				[AddressingImplied(),					InstructionINX()							],	// E8: INX
				[AddressingImmediateMemory(),				InstructionSBC(true)							],	// E9: SBC #immM
				[AddressingImplied(),					InstructionDummy(Instruction.NOP)					],	// EA: NOP
				[AddressingImplied(true),				InstructionXBA()							],	// EB: XBA
				[AddressingAbsDbr(),					InstructionCPX()							],	// EC: CPX abs
				[AddressingAbsDbr(),					InstructionSBC()							],	// ED: SBC abs
				[AddressingAbsRmw(),					InstructionINCMemory()							],	// EE: INC abs
				[AddressingAbsLong(),					InstructionSBC()							],	// EF: SBC long
				[AddressingRel(),					InstructionBranch(Instruction.BEQ, regs.GetStatusFlagZ())		],	// F0: BEQ rel
				[AddressingDpIdrIdxY(false),				InstructionSBC()							],	// F1: SBC (dp), Y
				[AddressingDpIdr(),					InstructionSBC()							],	// F2: SBC (dp)
				[AddressingStackRelIdrIdxY(),				InstructionSBC()							],	// F3: SBC (sr, S), Y
				[AddressingAbsDbr(),					InstructionPEA()							],	// F4: PEA abs
				[AddressingDpIdxX(),					InstructionSBC()							],	// F5: SBC dp, X
				[AddressingDpIdxY(),					InstructionINCMemory()							],	// F6: INC dp, Y
				[AddressingDpIdrLongIdxY(),				InstructionSBC()							],	// F7: SBC [dp], Y
				[AddressingImplied(),					InstructionSetFlag(Instruction.SED, 0x08 /* nvmxDizc */)		],	// F8: SED
				[AddressingAbsIdxY(false),				InstructionSBC()							],	// F9: SBC abs, Y
				[AddressingStackPull(flagX),				InstructionSetRegister(Instruction.PLX, 'X')				],	// FA: PLX
				[AddressingImplied(),					InstructionXCE()							],	// FB: XCE
				[AddressingAbsIdxIdrX(true),				InstructionJump(Instruction.JSR, 0)					],	// FC: JSR (abs, X)
				[AddressingAbsIdxX(false),				InstructionSBC()							],	// FD: SBC abs, X
				[AddressingAbsIdxX(false),				InstructionINCMemory()							],	// FE: INC abs, X
				[AddressingLongIdxX(),					InstructionSBC()							],	// FF: SBC long, X
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
				Region: access.Region,
				Type: accessType,
				Cycle: access.Speed,
			}];
		}
		private ReadDataByte(accessType: AccessType, address: number): [MemoryReadResult, AccessLog] {
			const access	= this.Memory.ReadByte(address);

			return [access, {
				AddressBus: address,
				DataBus: access.Data,
				Region: access.Region,
				Type: accessType,
				Cycle: access.Speed,
			}];
		}
		private WriteDataByte(accessType: AccessType, address: number, value: number): [MemoryWriteResult, AccessLog] {
			const access	= this.Memory.WriteByte(address, value);

			return [access, {
				AddressBus: address,
				DataBus: value,
				Region: access.Region,
				Type: accessType,
				Cycle: access.Speed,
			}];
		}

	}

	export class Registers{
		A: number	= 0;
		X: number	= 0;
		Y: number	= 0;
		S: number	= 0x01FD;
		PC: number	= 0;
		P: number	= 0x34;	// nvRBdIzc
		D: number	= 0;
		PB: number	= 0;
		DB: number	= 0;
		E: boolean	= true;

		public SetRegisters(dict: {[register: string]: number}){
			if(dict['E'] !== undefined){
				this.E	= !!dict['E'];
			}
			for(const key in dict){
				const value	= dict[key.toUpperCase()];
				switch(key){
					case 'A':	this.SetRegisterA(value);		break;
					case 'X':	this.SetRegisterX(value);		break;
					case 'Y':	this.SetRegisterY(value);		break;
					case 'S':	this.SetRegisterS(value);		break;
					case 'PC':	this.PC	= Utility.Type.ToWord(value);	break;
					case 'P':	this.SetRegisterP(value);		break;
					case 'D':	this.D	= Utility.Type.ToWord(value);	break;
					case 'PB':	this.PB	= Utility.Type.ToByte(value);	break;
					case 'DB':	this.DB	= Utility.Type.ToByte(value);	break;

					case 'C':	this.SetRegisterA(value, true);		break;
					//case 'XX':	this.SetRegisterX(value, true);		break;
					//case 'YX':	this.SetRegisterY(value, true);		break;
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
			let e	= this.GetStatusFlagC();
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
			return (this.DB << 16) + Utility.Type.ToWord(address);
		}
		public ToProgramAddress(address: number){
			return (this.PB << 16) | Utility.Type.ToWord(address);
		}
		public ToRelativeAddress(offset: number): number{
			return (this.PB << 16) | Utility.Type.ToWord(this.PC + offset);
		}

		public IsZeroDRegisterLow(): boolean{
			return Utility.Type.ToByte(this.D) == 0;
		}
		public GetOperandMask(): number{
			return (this.GetStatusFlagE() && this.IsZeroDRegisterLow())? 0x00FF : 0xFFFF;
		}
	};

	export class Memory{
		private AddressSpace: {[Address: number]: number}			= {};
		private SourceSpace: {[Address: number]: Assembler.SourceMapping}	= {};
		ROMMapping: RomMapping	= RomMapping.LoROM;
		IsFastROM: boolean	= false;

		CpuRegister: CpuRegister	= new CpuRegister();
		PpuRegister: PpuRegister	= new PpuRegister();
		DmaChannels: DmaChannel[]	= [];

		AddressBus: number	= 0;
		DataBus: number		= 0;
		Mode7Latch: number	= 0;
		Ppu1Bus: number		= 0;
		Ppu2Bus: number		= 0;

		constructor(){
			for(let i = 0; i < 8; i++){
				this.DmaChannels[i]	= new DmaChannel();
			}
		}

		public ReadByte(address: number): MemoryReadResult{
			const [region, realAddress]	= this.ToRealAddress(address);
			const [dataIO, maskIO]		= this.HookIORead(realAddress);
			let data			= (this.DataBus & (~maskIO)) | (dataIO & maskIO);

			const enableRegion		= (region !== AccessRegion.OpenBus) && (region !== AccessRegion.IO);
			if(enableRegion){
				data		= this.AddressSpace[realAddress] ?? 0;
			}
			data	= Utility.Type.ToByte(data);

			const speed		= this.UpdateBus(address, data);
			const source		= this.SourceSpace[realAddress] ?? null;
			const result: MemoryReadResult	= {
				Region: region,
				Data: data,
				Speed: speed,
				Source: source,
			};
			return result;
		}

		public WriteByte(address: number, data: number, romWrite: boolean = false): MemoryWriteResult{
			const [region, realAddress]	= this.ToRealAddress(address);
			if(!this.HookIOWrite(realAddress, data)){
				const enableRegion	= (region !== AccessRegion.ROM) && (region !== AccessRegion.OpenBus) && (region !== AccessRegion.IO);
				if(enableRegion || romWrite){
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
		public WriteSourceByte(address: number, data: number, source: Assembler.SourceMapping | null){
			const [region, realAddress]	= this.ToRealAddress(address);
			const enableRegion		= (region !== AccessRegion.OpenBus) && (region !== AccessRegion.IO);
			if(enableRegion){
				this.AddressSpace[realAddress]	= Utility.Type.ToByte(data);
				if(source){
					this.SourceSpace[realAddress]	= source;
				}
			}
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

			if(this.ROMMapping === RomMapping.LoROM){
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
			else if(this.ROMMapping === RomMapping.HiROM){
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

		private HookIORead(address: number): [number, number]{
			switch(address){
				case 0x002134:	// MPYL
					return [this.PpuRegister.MPYL, 0xFF];
				case 0x002135:	// MPYM
					return [this.PpuRegister.MPYM, 0xFF];
				case 0x002136:	// MPYH
					return [this.PpuRegister.MPYH, 0xFF];
				case 0x004216:	// RDMPYL
					return [this.CpuRegister.RDMPYL, 0xFF];
				case 0x004217:	// RDMPYH
					return [this.CpuRegister.RDMPYH, 0xFF];
			}
			if((address & 0xFFFF80) == 0x004300){
				const dmaChannel	= (address >> 4) & 0x07;
				const registerNumber	= address & 0x0F;
				const registerValue	= this.DmaChannels[dmaChannel].ReadRegister(registerNumber);
				if(registerValue !== null){
					return [registerValue, 0xFF];
				}
			}
			return [0, 0];
		}
		/**
		 * @returns memory hooked (true = I/O / false = memory)
		 */
		private HookIOWrite(address: number, data: number): boolean{
			switch(address){
				case 0x00210D:	// BG1HOFS
					// ---XXXXX XXXXXXXX
					this.PpuRegister.BG1HOFS	= this.UpdateMode7Latch(data) & 0x1FFF;
					return true;
				case 0x00210E:	// BG1VOFS
					// ---YYYYY YYYYYYYY
					this.PpuRegister.BG1VOFS	= this.UpdateMode7Latch(data) & 0x1FFF;
					return true;
				case 0x00211B:	// M7A
					// DDDDDDDD dddddddd
					this.PpuRegister.M7A		= this.UpdateMode7Latch(data);
					this.PpuRegister.StartMultiplication();
					return true;
				case 0x00211C:	// M7B
					// DDDDDDDD dddddddd
					this.PpuRegister.M7B		= this.UpdateMode7Latch(data);
					this.PpuRegister.StartMultiplication();
					return true;
				case 0x00211D:	// M7C
					// DDDDDDDD dddddddd
					this.PpuRegister.M7C		= this.UpdateMode7Latch(data);
					return true;
				case 0x00210E:	// M7D
					// DDDDDDDD dddddddd
					this.PpuRegister.M7D		= this.UpdateMode7Latch(data);
					return true;
				case 0x00211F:	// M7X
					// ---XXXXX XXXXXXXX
					this.PpuRegister.M7X		= this.UpdateMode7Latch(data) & 0x1FFF;
					return true;
				case 0x002120:	// M7Y
					// ---YYYYY YYYYYYYY
					this.PpuRegister.M7Y		= this.UpdateMode7Latch(data) & 0x1FFF;
					return true;
				case 0x004202:	// WRMPYA
					// DDDDDDDD
					this.CpuRegister.WRMPYA		= data;
					return true;
				case 0x004203:	// WRMPYB
					// DDDDDDDD
					this.CpuRegister.WRMPYB		= data;
					this.CpuRegister.StartMultiplication();
					return true;
				case 0x004204:	// WRDIVL
					// LLLLLLLL
					this.CpuRegister.WRDIVL		= data;
					return true;
				case 0x004205:	// WRDIVH
					// HHHHHHHH
					this.CpuRegister.WRDIVH		= data;
					return true;
				case 0x004206:	// WRDIVB
					// DDDDDDDD
					this.CpuRegister.WRDIVB		= data;
					this.CpuRegister.StartMultiplication();
					return true;
				case 0x00420D:	// MEMSEL
					// -------F
					this.IsFastROM			= (data & 1) !== 0;
					return true;
			}
			if((address & 0xFFFF80) == 0x004300){
				const dmaChannel	= (address >> 4) & 0x07;
				const registerNumber	= address & 0x0F;
				this.DmaChannels[dmaChannel].WriteRegister(registerNumber, data);
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

		private UpdateMode7Latch(value: number): number{
			value		= Utility.Type.ToByte(value);
			this.Mode7Latch	= Utility.Type.ToWord(((this.Mode7Latch) << 8) | value);
			return this.Mode7Latch;
		}

		public ClockIO(){
			this.PpuRegister.Step();
		}
		public CpuStepIO(){
			this.CpuRegister.Step();
		}
	}

	export class CpuRegister{
		NMITIMEN: number	= 0; // $4200
		WRIO: number		= 0; // $4201
		WRMPYA: number		= 0; // $4202
		WRMPYB: number		= 0; // $4203
		WRDIVL: number		= 0; // $4204
		WRDIVH: number		= 0; // $4205
		WRDIVB: number		= 0; // $4206
		HTIMEL: number		= 0; // $4207
		HTIMEH: number		= 0; // $4208
		VTIMEL: number		= 0; // $4209
		VTIMEH: number		= 0; // $420A
		MDMAEN: number		= 0; // $420B
		HDMAEN: number		= 0; // $420C
		MEMSEL: number		= 0; // $420D
		RDNMI: number		= 0; // $4210
		TIMEUP: number		= 0; // $4211
		HVBJOY: number		= 0; // $4212
		RDIO: number		= 0; // $4213
		RDDIVL: number		= 0; // $4214
		RDDIVH: number		= 0; // $4215
		RDMPYL: number		= 0; // $4216
		RDMPYH: number		= 0; // $4217
		JOY1L: number		= 0; // $4218
		JOY1H: number		= 0; // $4219
		JOY2L: number		= 0; // $421A
		JOY2H: number		= 0; // $421B
		JOY3L: number		= 0; // $421C
		JOY3H: number		= 0; // $421D
		JOY4L: number		= 0; // $421E
		JOY4H: number		= 0; // $421F

		private stepMultiplication: number	= 0;
		private stepDivision: number		= 0;

		public StartMultiplication(){
			this.stepMultiplication		= 8;
		}
		public StartDivision(){
			this.stepDivision		= 16;
		}

		public Step(){
			// TODO: Implements
		}
	}
	export class PpuRegister{
		INIDISP: number		= 0; // $2100
		OBSEL: number		= 0; // $2101
		OAMADDL: number		= 0; // $2102
		OAMADDH: number		= 0; // $2103
		OAMDATA: number		= 0; // $2104
		BGMODE: number		= 0; // $2105
		MOSAIC: number		= 0; // $2106
		BG1SC: number		= 0; // $2107
		BG2SC: number		= 0; // $2108
		BG3SC: number		= 0; // $2109
		BG4SC: number		= 0; // $210A
		BG12NBA: number		= 0; // $210B
		BG34NBA: number		= 0; // $210C
		BG1HOFS: number		= 0; // $210D
		BG1VOFS: number		= 0; // $210E
		BG2HOFS: number		= 0; // $210F
		BG2VOFS: number		= 0; // $2110
		BG3HOFS: number		= 0; // $2111
		BG3VOFS: number		= 0; // $2112
		BG4HOFS: number		= 0; // $2113
		BG4VOFS: number		= 0; // $2114
		VMAIN: number		= 0; // $2115
		VMADDL: number		= 0; // $2116
		VMADDH: number		= 0; // $2117
		VMDATAL: number		= 0; // $2118
		VMDATAH: number		= 0; // $2119
		M7SEL: number		= 0; // $211A
		M7A: number		= 0; // $211B
		M7B: number		= 0; // $211C
		M7C: number		= 0; // $211D
		M7D: number		= 0; // $211E
		M7X: number		= 0; // $211F
		M7Y: number		= 0; // $2120
		CGADD: number		= 0; // $2121
		CGDATA: number		= 0; // $2122
		W12SEL: number		= 0; // $2123
		W34SEL: number		= 0; // $2124
		WOBJSEL: number		= 0; // $2125
		WH0: number		= 0; // $2126
		WH1: number		= 0; // $2127
		WH2: number		= 0; // $2128
		WH3: number		= 0; // $2129
		WBGLOG: number		= 0; // $212A
		WOBJLOG: number		= 0; // $212B
		TM: number		= 0; // $212C
		TS: number		= 0; // $212D
		TMW: number		= 0; // $212E
		TSW: number		= 0; // $212F
		CGWSEL: number		= 0; // $2130
		CGADSUB: number		= 0; // $2131
		COLDATA: number		= 0; // $2132
		SETINI: number		= 0; // $2133
		MPYL: number		= 0; // $2134
		MPYM: number		= 0; // $2135
		MPYH: number		= 0; // $2136
		SLHV: number		= 0; // $2137
		OAMDATAREAD: number	= 0; // $2138
		VMDATALREAD: number	= 0; // $2139
		VMDATAHREAD: number	= 0; // $213A
		CGDATAREAD: number	= 0; // $213B
		OPHCT: number		= 0; // $213C
		OPVCT: number		= 0; // $213D
		STAT77: number		= 0; // $213E
		STAT78: number		= 0; // $213F
		APUIO0: number		= 0; // $2140
		APUIO1: number		= 0; // $2141
		APUIO2: number		= 0; // $2142
		APUIO3: number		= 0; // $2143
		WMDATA: number		= 0; // $2180
		WMADDL: number		= 0; // $2181
		WMADDM: number		= 0; // $2182
		WMADDH: number		= 0; // $2183

		private stepMultiplication: number	= 0;

		public StartMultiplication(){
			this.stepMultiplication		= 1;
		}

		public Step(){
			if(this.stepMultiplication > 0){
				const result		= Utility.Type.ToShort(this.M7A) * Utility.Type.ToChar(this.M7B);
				const resultUint	= Utility.Type.ToUint(result);
				this.MPYL		= Utility.Type.ToByte(resultUint      );
				this.MPYM		= Utility.Type.ToByte(resultUint >>  8);
				this.MPYH		= Utility.Type.ToByte(resultUint >> 16);

				this.stepMultiplication--;
			}
		}
	}
	export class DmaChannel{
		DMAPn: number	= 0;	// $43n0
		BBADn: number	= 0;	// $43n1
		A1TnL: number	= 0;	// $43n2
		A1TnH: number	= 0;	// $43n3
		A1Bn: number	= 0;	// $43n4
		DASnL: number	= 0;	// $43n5
		DASnH: number	= 0;	// $43n6
		DASBn: number	= 0;	// $43n7
		A2AnL: number	= 0;	// $43n8
		A2AnH: number	= 0;	// $43n9
		NLTRn: number	= 0;	// $43nA
		UNUSEDn: number	= 0;	// $43nB / $43nF

		public ReadRegister(registerNumber: number): number | null{
			switch(registerNumber){
				case 0x00:	return this.DMAPn;
				case 0x01:	return this.BBADn;
				case 0x02:	return this.A1TnL;
				case 0x03:	return this.A1TnH;
				case 0x04:	return this.A1Bn;
				case 0x05:	return this.DASnL;
				case 0x06:	return this.DASnH;
				case 0x07:	return this.DASBn;
				case 0x08:	return this.A2AnL;
				case 0x09:	return this.A2AnH;
				case 0x0A:	return this.NLTRn;
				case 0x0B:	return this.UNUSEDn;
				case 0x0F:	return this.UNUSEDn;
			}
			return null;
		}
		public WriteRegister(registerNumber: number, value: number){
			switch(registerNumber){
				case 0x00:	this.DMAPn	= value;
				case 0x01:	this.BBADn	= value;
				case 0x02:	this.A1TnL	= value;
				case 0x03:	this.A1TnH	= value;
				case 0x04:	this.A1Bn	= value;
				case 0x05:	this.DASnL	= value;
				case 0x06:	this.DASnH	= value;
				case 0x07:	this.DASBn	= value;
				case 0x08:	this.A2AnL	= value;
				case 0x09:	this.A2AnH	= value;
				case 0x0A:	this.NLTRn	= value;
				case 0x0B:	this.UNUSEDn	= value;
				case 0x0F:	this.UNUSEDn	= value;
			}
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
		AbsoluteJump,				// abs (Jump, no referrer)
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
		1 + 2,	// Instruction.AbsoluteJump
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
	//     Mnemonic  imp         S           #immM       dp          dp,Y        (dp,X)      [dp]        abs         abs,X       (abs)       [abs]       long,X      rlong       (sr,S),Y  	           Flags
	//                     A           #imm8       #immX       dp,X        (dp)        (dp),Y      [dp],Y      absJ        abs,Y       (abs,X)     long        rel         sr,S        xyc
		'ADC': [ null, null, null, null, 0x69, null, 0x65, 0x75, null, 0x72, 0x61, 0x71, 0x67, 0x77, 0x6D, null, 0x7D, 0x79, null, null, null, 0x6F, 0x7F, null, null, 0x63, 0x73, null ],	// NV----ZC
		'AND': [ null, null, null, null, 0x29, null, 0x25, 0x35, null, 0x32, 0x21, 0x31, 0x27, 0x37, 0x2D, null, 0x3D, 0x39, null, null, null, 0x2F, 0x3F, null, null, 0x23, 0x33, null ],	// N-----Z-
		'ASL': [ null, 0x0A, null, null, null, null, 0x06, 0x16, null, null, null, null, null, null, 0x0E, null, 0x1E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		'BCC': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null ],	// --------
		'BCS': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null ],	// --------
		'BEQ': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF0, null, null, null, null ],	// --------
	//	'BGE': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null ],	// --------
		'BIT': [ null, null, null, null, 0x89, null, 0x24, 0x34, null, null, null, null, null, null, 0x2C, null, 0x3C, null, null, null, null, null, null, null, null, null, null, null ],	// NV----Z- / #imm : ------Z-
	//	'BLT': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null ],	// --------
		'BMI': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x30, null, null, null, null ],	// --------
		'BNE': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xD0, null, null, null, null ],	// --------
		'BPL': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x10, null, null, null, null ],	// --------
		'BRA': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x80, null, null, null, null ],	// --------
	//	'BRK': [ null, null, 0x00, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'BRK': [ null, null, null, 0x00, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'BRL': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x82, null, null, null ],	// --------
		'BVC': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x50, null, null, null, null ],	// --------
		'BVS': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x70, null, null, null, null ],	// --------
		'CLC': [ 0x18, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C
		'CLD': [ 0xD8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----D---
		'CLI': [ 0x58, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -----I--
		'CLV': [ 0xB8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -V------
	//	'CMA': [ null, null, null, null, 0xC9, null, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, null, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null ],	// N-----ZC
		'CMP': [ null, null, null, null, 0xC9, null, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, null, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null ],	// N-----ZC
	//	'COP': [ null, null, 0x02, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'COP': [ null, null, null, 0x02, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI--
		'CPX': [ null, null, null, null, null, 0xE0, 0xE4, null, null, null, null, null, null, null, 0xEC, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		'CPY': [ null, null, null, null, null, 0xC0, 0xC4, null, null, null, null, null, null, null, 0xCC, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
	//	'DEA': [ null, 0x3A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'DEC': [ null, 0x3A, null, null, null, null, 0xC6, 0xD6, null, null, null, null, null, null, 0xCE, null, 0xDE, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'DEX': [ 0xCA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'DEY': [ 0x88, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'EOR': [ null, null, null, null, 0x49, null, 0x45, 0x55, null, 0x52, 0x41, 0x51, 0x47, 0x57, 0x4D, null, 0x5D, 0x59, null, null, null, 0x4F, 0x5F, null, null, 0x43, 0x53, null ],	// N-----Z-
	//	'INA': [ null, 0x1A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'INC': [ null, 0x1A, null, null, null, null, 0xE6, 0xF6, null, null, null, null, null, null, 0xEE, null, 0xFE, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'INX': [ 0xE8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'INY': [ 0xC8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'JML': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xDC, 0x5C, null, null, null, null, null, null ],	// --------
	//	'JMP': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, null, 0x6C, 0x7C, 0xDC, 0x5C, null, null, null, null, null, null ],	// --------
		'JMP': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, null, 0x6C, 0x7C, null, null, null, null, null, null, null, null ],	// --------
		'JSL': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x22, null, null, null, null, null, null ],	// --------
	//	'JSR': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, null, 0xFC, null, 0x22, null, null, null, null, null, null ],	// --------
		'JSR': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, null, 0xFC, null, null, null, null, null, null, null, null ],	// --------
		'LDA': [ null, null, null, null, 0xA9, null, 0xA5, 0xB5, null, 0xB2, 0xA1, 0xB1, 0xA7, 0xB7, 0xAD, null, 0xBD, 0xB9, null, null, null, 0xAF, 0xBF, null, null, 0xA3, 0xB3, null ],	// N-----Z-
		'LDX': [ null, null, null, null, null, 0xA2, 0xA6, null, 0xB6, null, null, null, null, null, 0xAE, null, null, 0xBE, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'LDY': [ null, null, null, null, null, 0xA0, 0xA4, 0xB4, null, null, null, null, null, null, 0xAC, null, 0xBC, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'LSR': [ null, 0x4A, null, null, null, null, 0x46, 0x56, null, null, null, null, null, null, 0x4E, null, 0x5E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		'MVN': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x54 ],	// --------
		'MVP': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x44 ],	// --------
		'NOP': [ 0xEA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'ORA': [ null, null, null, null, 0x09, null, 0x05, 0x15, null, 0x12, 0x01, 0x11, 0x07, 0x17, 0x0D, null, 0x1D, 0x19, null, null, null, 0x0F, 0x1F, null, null, 0x03, 0x13, null ],	// N-----Z-
		'PEA': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF4, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PEI': [ null, null, null, null, null, null, null, null, null, 0xD4, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PER': [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x62, null, null, null ],	// --------
		'PHA': [ null, null, 0x48, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHB': [ null, null, 0x8B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHD': [ null, null, 0x0B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHK': [ null, null, 0x4B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHP': [ null, null, 0x08, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHX': [ null, null, 0xDA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PHY': [ null, null, 0x5A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'PLA': [ null, null, 0x68, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLB': [ null, null, 0xAB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLD': [ null, null, 0x2B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLP': [ null, null, 0x28, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'PLX': [ null, null, 0xFA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'PLY': [ null, null, 0x7A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'REP': [ null, null, null, 0xC2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'ROL': [ null, 0x2A, null, null, null, null, 0x26, 0x36, null, null, null, null, null, null, 0x2E, null, 0x3E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'ROR': [ null, 0x6A, null, null, null, null, 0x66, 0x76, null, null, null, null, null, null, 0x6E, null, 0x7E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'RTI': [ null, null, 0x40, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'RTL': [ null, null, 0x6B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'RTS': [ null, null, 0x60, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'SBC': [ null, null, null, null, 0xE9, null, 0xE5, 0xF5, null, 0xF2, 0xE1, 0xF1, 0xE7, 0xF7, 0xED, null, 0xFD, 0xF9, null, null, null, 0xEF, 0xFF, null, null, 0xE3, 0xF3, null ],	// N-----ZC
		'SEC': [ 0x38, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C
		'SED': [ 0xF8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----D---
		'SEI': [ 0x78, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -----I--
		'SEP': [ null, null, null, 0xE2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC
		'STA': [ null, null, null, null, null, null, 0x85, 0x95, null, 0x92, 0x81, 0x91, 0x87, 0x97, 0x8D, null, 0x9D, 0x99, null, null, null, 0x8F, 0x9F, null, null, 0x83, 0x93, null ],	// --------
		'STP': [ 0xDB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'STX': [ null, null, null, null, null, null, 0x86, null, 0x96, null, null, null, null, null, 0x8E, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'STY': [ null, null, null, null, null, null, 0x84, 0x94, null, null, null, null, null, null, 0x8C, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'STZ': [ null, null, null, null, null, null, 0x64, 0x74, null, null, null, null, null, null, 0x9C, null, 0x9E, null, null, null, null, null, null, null, null, null, null, null ],	// --------
	//	'SWA': [ 0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
	//	'TAD': [ 0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
	//	'TAS': [ 0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'TAX': [ 0xAA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TAY': [ 0xA8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TCD': [ 0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TCS': [ 0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
	//	'TDA': [ 0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TDC': [ 0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TRB': [ null, null, null, null, null, null, 0x14, null, null, null, null, null, null, null, 0x1C, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ------Z-
		'TSB': [ null, null, null, null, null, null, 0x04, null, null, null, null, null, null, null, 0x0C, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ------Z-
	//	'TSA': [ 0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TSC': [ 0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TSX': [ 0xBA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TXA': [ 0x8A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TXS': [ 0x9A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'TXY': [ 0x9B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TYA': [ 0x98, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'TYX': [ 0xBB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'WAI': [ 0xCB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'WDM': [ null, null, null, 0x42, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		'XBA': [ 0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		'XCE': [ 0xFB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C (C=E, E=C)
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
		Instruction: Instruction		= Instruction.NOP;	// Initial: NOP ($EA)
		Addressing: Addressing			= Addressing.Implied;
		Opcode: number | null			= InstructionTable[Emulator.Instruction[this.Instruction]][this.Addressing];
		Operand1: number			= 0;
		Operand2: number			= 0;
		InstructionAddress: number		= 0;
		IndirectAddress: number			= 0;
		EffectiveAddress: number		= 0;
		EffectiveValue: number			= 0;
		MasterCycle: number			= 0;
		CpuCycle: number			= 0;
		InstructionLength: number		= 0;
		Registers: Registers			= new Registers();
		AccessLog: AccessLog[]			= [];
		Source: Assembler.SourceMapping | null	= null;

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
			const strEffValB	= Utility.Format.ToHexString(this.EffectiveValue);
			const strLngAccess	= `$${strEffAddr} => $${strEffValM}`;
			const strIndAccess	= `$${strIndAddr} > $${strEffAddr} => $${strEffValM}`;
			const strOprRel		= Utility.Format.SignChar(this.Operand1) + Math.abs(this.Operand1).toString();
			const strRelDst		= Utility.Format.ToHexString(this.EffectiveAddress, 4);
			const strXycDst		= '$' + strOpr1B + Utility.Format.ToHexString(this.Registers.Y, 4);
			const strXycSrc		= '$' + strOpr2B + Utility.Format.ToHexString(this.Registers.X, 4);
			return [
				``,										// imp
				`A`,										// A
				``,										// S
				`#$${strOpr1B}`,								// #imm8
				`#$${strOpr1M}`,								// #immM
				`#$${strOpr1X}`,								// #immX
				`$${strOpr1B} @ ${strLngAccess}`,						// dp
				`$${strOpr1B}, X @ ${strLngAccess}`,						// dp,X
				`$${strOpr1B}, Y @ ${strLngAccess}`,						// dp,Y
				`($${strOpr1B}) @ ${strIndAccess}`,						// (dp)
				`($${strOpr1B}, X) @ ${strIndAccess}`,						// (dp,X)
				`($${strOpr1B}), Y @ ${strIndAccess}`,						// (dp),Y
				`[$${strOpr1B}] @ ${strIndAccess}`,						// [dp]
				`[$${strOpr1B}], Y @ ${strIndAccess}`,						// [dp],Y
				`$${strOpr1W} @ ${strLngAccess}`,						// abs
				`$${strOpr1W}`,									// absJ
				`$${strOpr1W}, X @ ${strLngAccess}`,						// abs,X
				`$${strOpr1W}, Y @ ${strLngAccess}`,						// abs,Y
				`($${strOpr1W}) @ ${strIndAccess}`,						// (abs)
				`($${strOpr1W}, X) @ ${strIndAccess}`,						// (abs,X)
				`[$${strOpr1W}] @ ${strIndAccess}`,						// [abs]
				`$${strOpr1L}`,									// long
				`$${strOpr1L}, X @ ${strLngAccess}`,						// long,X
				`$${strRelDst} @ ${strOprRel}`,							// rel
				`$${strRelDst} @ ${strOprRel}`,							// rlong
				`$${strOpr1B}, S @ ${strLngAccess}`,						// sr,S
				`($${strOpr1B}, S), Y @ ${strIndAccess}`,					// (sr,S),Y
				`$${strOpr2B}, $${strOpr1B} @ ${strXycDst} <- ${strXycSrc} => ${strEffValB}`,	// xyc	; src, dst
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

		public static AccessLogToString(log: AccessLog){
			return `[${Utility.Format.PadSpace(AccessType[log.Type], 12)}]`
			+ ` $${Utility.Format.ToHexString(log.AddressBus, 6)} = $${Utility.Format.ToHexString(log.DataBus, 2)}`
			+ ` @ ${AccessSpeed[log.Cycle]}`;
		}
	}

	export type AccessLog	= {
		AddressBus: number;
		DataBus: number;
		Region: AccessRegion;
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
	export enum RomMapping{
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
		Source: Assembler.SourceMapping | null;
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
					SourceInformation: new SourceMapping(file, lineNumber + 1, lines[lineNumber]),
					Address: 0,
					Options: options,
				});
			}
			const pushError	= (message: string) => {
				this.ErrorMessages.push({
					SourceInformation: new SourceMapping(file, lineNumber + 1, lines[lineNumber]),
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

			// skip local define
			if(line.match(/^.[^\s=,]+\s*=/)){
				// local define
				return null;
			}

			if(match){
				// global label
				const globalLabel	= match[1];
				const remain		= match[2];
				if(globalLabel.match(/[\+\-*/%<>\|\^#$\.]/)){
					pushError(`Invalid label name. "${globalLabel}"`);
					return '';
				}
				else if(this.LabelList[globalLabel]){
					pushError(`Global label name conflict. "${globalLabel}"`);
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
					pushError(`Invalid label name. "${localLabel}"`);
					return '';
				}
				else if((!this.NowScopeName) || (!this.LabelList[this.NowScopeName])){
					pushError(`Local label used in global scope. "${localLabel}"`);
					return '';
				}
				else if(this.LabelList[this.NowScopeName].LocalScope[localLabel]){
					pushError(`Local label name conflict. "${this.NowScopeName}" > "${localLabel}"`);
					return '';
				}
				else if(this.LabelList[this.NowScopeName].LocalDefine[localLabel]){
					pushError(`Local label name conflict. "${this.NowScopeName}" > "${localLabel}"`);
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
			if(instruction === null){
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
			const defineMatch	= line.match(/([^\s=,]+)\s*=\s*([^=,]+)(.*)/);
			if(!defineMatch){
				return null;
			}

			const defineName	= defineMatch[1];
			const defineValue	= defineMatch[2];
			const remain		= defineMatch[3];

			if(defineName.match(/[+\-*/<>\(\)\[\]\{\}\"#$%&\'\|^]/)){
				pushError(`Invalid define name. "${defineName}"`);
				return '';
			}
			if(defineName[0] !== '.'){
				if(this.DefineList[defineName]){
					pushError(`Define name conflict. "${defineName}"`);
					return '';
				}

				const define	= new DefineItem();
				define.Value	= defineValue;
				this.DefineList[defineName]	= define;

				pushToken(CodeTokenType.Define, [defineName]);
			}
			else{
				if((!this.NowScopeName) || (!this.LabelList[this.NowScopeName])){
					pushError(`Local define used in global scope. "${defineName}"`);
					return '';
				}
				else if(this.LabelList[this.NowScopeName].LocalDefine[defineName]){
					pushError(`Local define name conflict. "${this.NowScopeName}" > "${defineName}"`);
					return '';
				}
				else if(this.LabelList[this.NowScopeName].LocalScope[defineName]){
					pushError(`Local define name conflict. "${this.NowScopeName}" > "${defineName}"`);
					return '';
				}

				const define	= new DefineItem();
				define.Value	= defineValue;
				this.LabelList[this.NowScopeName].LocalDefine[defineName]	= define;

				pushToken(CodeTokenType.DefineLocal, [defineName]);
			}

			return remain;
		}

		private ConfirmAddress(): boolean{
			let token: Token;

			const pushError		= (message: string) => {
				this.ErrorMessages.push({
					SourceInformation: token.SourceInformation,
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
						this.NowAddress	+= this.GetDataBytes(token, 1, false, pushError).length;
						break;
					case CodeTokenType.DirectiveDataWord:		// ".dw"
						this.NowAddress	+= this.GetDataBytes(token, 2, false, pushError).length;
						break;
					case CodeTokenType.DirectiveDataLong:		// ".dl"
						this.NowAddress	+= this.GetDataBytes(token, 3, false, pushError).length;
						break;
					case CodeTokenType.DirectiveDataDouble:		// ".dd"
						this.NowAddress	+= this.GetDataBytes(token, 4, false, pushError).length;
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
					case CodeTokenType.DefineLocal:			// ".Xxx=YY"
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
				case Emulator.Addressing.AbsoluteJump:				// absJ
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
					SourceInformation: token.SourceInformation,
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
				const beforeChunkLength	= chunk.Data.length;

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
						const data	= this.GetDataBytes(token, 1, true, pushError);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveDataWord: {		// ".dw"
						const data	= this.GetDataBytes(token, 2, true, pushError);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveDataLong: {		// ".dl"
						const data	= this.GetDataBytes(token, 3, true, pushError);
						chunk.Data	= chunk.Data.concat(data);
						break;
					}
					case CodeTokenType.DirectiveDataDouble: {	// ".dd"
						const data	= this.GetDataBytes(token, 4, true, pushError);
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
					case CodeTokenType.DefineLocal:			// ".Xxx=YY"
						// NOP
						break;
				}

				const addChunkLength	= chunk.Data.length - beforeChunkLength;
				for(let i = 0; i < addChunkLength; i++){
					chunk.Source.push(token.SourceInformation);
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
				case Emulator.Addressing.AbsoluteJump:				// absJ
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
			depth++;
			if(depth > 100){
				return [null, 'The definition is too deep.'];
			}

			// define
			if(this.DefineList[name]){
				const valueString	= this.DefineList[name].Value;
				const [value, message]	= this.ResolveValue(valueString, depth);
				if((value !== null) && (value !== InvalidAddress)){
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
					if(this.MinusLabelList[i] <= this.NowAddress){
						return [this.MinusLabelList[i], 'minus label'];
					}
				}
				return [null, 'Minus label resolution failed.'];
			}

			// expression
			const matchExpression	= name.match(/^([^\s*/%<>&\|\^][^\s\+\-*/%<>&\|\^]*)\s*([\+\-*/%<>&\|\^]+)\s*(.*)$/);
			if(matchExpression){
				const leftString	= matchExpression[1];
				const operator		= matchExpression[2];
				const rightString	= matchExpression[3];
				const operatorFunction	= Assembler.OperatorFunctions[operator];
				if(!operatorFunction){
					return [null, 'Invalid operator.'];
				}

				const [leftValue, leftMessage]		= this.ResolveValue(leftString, depth);
				const [rightValue, rightMessage]	= this.ResolveValue(rightString, depth);
				if((leftValue === null) || (leftValue === InvalidAddress)){
					return [null, leftMessage];
				}
				if((rightValue === null) || (rightValue === InvalidAddress)){
					return [null, rightMessage];
				}
				return [operatorFunction(leftValue, rightValue), 'expression'];
			}

			// local label or define
			if(name[0] === '.'){
				const scope	= this.LabelList[this.NowScopeName];
				if(!scope){
					return [null, 'Scope resolution failed.'];
				}
				const label	= scope.LocalScope[name];
				const define	= scope.LocalDefine[name];
				if(!label && !define){
					return [null, `Failed to resolve local label or define "${name}".`];
				}
				if(label){
					if(label.Address === InvalidAddress){
						return [null, 'Invalid address local label.'];
					}
					return [label.Address, 'local label'];
				}
				else{
					const [value, message]	= this.ResolveValue(define.Value, depth);
					if((value !== null) && (value !== InvalidAddress)){
						return [value, 'local define']
					}
					else{
						return [null, message];
					}
				}
			}

			// global label
			if(this.LabelList[name]){
				const label	= this.LabelList[name];
				if(label.Address === InvalidAddress){
					return [null, 'Invalid address global label.'];
				}
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

		private GetDataBytes(token: Token, baseSize: number, strict: boolean, pushError: (message: string) => void): number[]{
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
						if((resolved === null) && strict){
							pushError(message);
						}
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
						output	+= c;
						continue;
					}
					else{
						// slash comment, cancel last character
						output	= output.substring(0, output.length - 1);
						break;
					}
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
				errorStrings.push(`[${i}] Line:${m.SourceInformation.Line} ${m.Message}` + newline + m.SourceInformation.Source);
			}

			return errorStrings;
		}

		private DumpTokens(print: (message: string) => void = console.log, newline: string = '\n'){
			// for debug
			for(let i = 0; i < this.Tokens.length; i++){
				const t	= this.Tokens[i];
				let l	= `[${i}] Line:${t.SourceInformation.Line} $${Utility.Format.ToHexString(t.Address, 6)} ${CodeTokenType[t.TokenType]}: #${t.Options.length} ${t.Options}`;

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
		SourceInformation: SourceMapping,
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
		DefineLocal,		// ".Xxx=YY"
	}
	class Token{
		TokenType: CodeTokenType				= CodeTokenType.Invalid;
		SourceInformation: SourceMapping			= new SourceMapping('', 0, '');
		Address: number						= 0;
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

	const InvalidAddress	= 0xFFFFFFFF;
	class ScopeItem{
		Address: number	= InvalidAddress;
		LocalScope: { [LocalLabel: string]: LocalScopeItem}	= {};
		LocalDefine: { [Define: string]: DefineItem }		= {};
	}
	class LocalScopeItem{
		Address: number	= InvalidAddress;
	}

	class DefineItem{
		Value: number | string	= InvalidAddress;
	}

	export class SourceMapping{
		constructor(
			public File: string,
			public Line: number,
			public Source: string,
		){}
	}

	export class DataChunk{
		Address: number		= InvalidAddress;
		Data: number[]		= [];
		Source: SourceMapping[]	= [];
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
		private static Assembled: Assembler.DataChunk[] | null	= null;
		private static Memory: Emulator.Memory			= new Emulator.Memory();
		private static Cpu: Emulator.Cpu			= new Emulator.Cpu(this.Memory);

		private static dummyNode	= document.createElement('span');
		private static dummyInputNode	= document.createElement('input');
		private static Dom: {[name: string]: HTMLElement}	= {
			'ErrorMessage':			Main.dummyNode,
			'AssemblerSource':		Main.dummyNode,
			'AssemblerOutput':		Main.dummyNode,
			'HexIntelHex':			Main.dummyNode,
			'HexSrec':			Main.dummyNode,
			'AssemblerAssemble':		Main.dummyNode,
			'AssembledRun':			Main.dummyNode,
			'CopyUrl':			Main.dummyNode,
			'ResultStatistics_Step':	Main.dummyNode,
			'ResultStatistics_Cycle':	Main.dummyNode,
			'ResultStatistics_Master':	Main.dummyNode,
			'ViewerTextLog':		Main.dummyNode,
			'ViewerTextLog_Log':		Main.dummyNode,
			'ViewerTableLog':		Main.dummyNode,
			'ViewerTimeline':		Main.dummyNode,
			'ViewerHeatmap':		Main.dummyNode,
			'ViewerWritten':		Main.dummyNode,
		};

		public static Initialize(){
			Main.Assembled	= null;

			if(!Main.GetDomElements()){
				return;
			}

			DomUtility.AllowTab(Main.Dom.AssemblerSource as HTMLInputElement);
			DomUtility.ApplyDomEvents('.hexinput', DomUtility.HexadecimalInput);
			DomUtility.ApplyDomEvents('.intinput', DomUtility.IntegerInput);
			DomUtility.ApplyDomEvents('#ViewerSelect input[type="radio"] ', Main.CheckSelectedViewer);

			Main.Dom.AssemblerAssemble.removeAttribute('disabled');
			Main.Dom.CopyUrl.removeAttribute('disabled');
			Main.Dom.AssemblerAssemble.addEventListener('click', Main.Assemble);
			Main.Dom.AssembledRun.addEventListener('click', Main.Run);

			Main.ClearResultViewer();
			Main.UpdateSelectedViewer();

			const setting	= Main.GetUrlParameter();
			if(setting){
				Main.SetSetting(setting);
				if(setting.Source.length > 0){
					Main.Dom.AssemblerAssemble.click();
					Main.Dom.AssembledRun.click();
				}
			}

			Main.Dom.ErrorMessage.classList.add('hide');
		}

		private static GetDomElements(): boolean{
			let result	= true;
			const set	= (name: string): boolean => {
				const element	= document.querySelector<HTMLElement>('#' + name);
				if(element){
					Main.Dom[name]	= element;
					return true;
				}
				return false;
			}
			for(const key in Main.Dom){
				result	&&= set(key);
			}
			return result;
		}

		public static Assemble(){
			Main.Assembled	= null;
			Main.ClearResultViewer();

			// Setting from form
			const setting		= Main.GetSetting();

			const source		= setting.Source;
			if((!source) || (source.length <= 0)){
				Main.SetAssemblerError(false, []);
				return;
			}
			const [assembled, message]	= Assembler.Assembler.Assemble(source, setting.StartAddress);
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

			// Setting from form
			const setting		= Main.GetSetting();
			memory.ROMMapping	= setting.RomMapping;
			memory.IsFastROM	= setting.FastRom;
			const maxCycle		= setting.MaxCycle;
			const statusFlagE	= setting.StatusFlagE;

			Main.UploadDefaultMemory(setting.StartAddress);
			Main.UploadMemory();

			const cpu		= new Emulator.Cpu(Main.Memory);
			Main.Cpu		= cpu;

			const initialRegisters	= new Emulator.Registers();
			initialRegisters.SetStatusFlagE(statusFlagE);
			cpu.ResetRegisters	= {
				PB:	Utility.Type.ToByte(setting.StartAddress >> 16),
				PC:	Utility.Type.ToWord(setting.StartAddress & 0x00FFFF),
				E:	(setting.StatusFlagE)? 1 : 0,
			};

			cpu.Boot();

			let stepCounter	= 0;
			while((!cpu.CpuHalted) && (cpu.MasterCycleCounter < maxCycle) && (stepCounter < maxCycle)){
				cpu.Step();
				stepCounter++;

				if(cpu.Logs.length > 0){
					const lastInstruction	= cpu.Logs[cpu.Logs.length - 1].Instruction;
					const settingStop	= setting.GetEmulationStopInstruction(lastInstruction);
					if(settingStop){
						break;
					}
				}
			}

			Main.UpdateResultViewer(cpu);
		}

		private static UploadChunk(memory: Emulator.Memory, chunk: Assembler.DataChunk){
			for(let i = 0; i < chunk.Data.length; i++){
				memory.WriteSourceByte(chunk.Address + i, chunk.Data[i], chunk.Source[i]);
			}
		}
		private static UploadDefaultMemory(startAddress: number){
			const resetVector: Assembler.DataChunk	= {
				Address: 0x00FFE0,
				Data: [],
				Source: [],
			}
			const pushWord	= (chunk: Assembler.DataChunk, value: number) => {
				chunk.Data.push(Utility.Type.ToByte(value >>  0));
				chunk.Data.push(Utility.Type.ToByte(value >>  8));
			}
			for(let i = 0; i < 16; i++){
				pushWord(resetVector, startAddress);
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

		private static GetSetting(): Setting{

			function getDom(name: string): HTMLInputElement{
				const dom	= document.querySelector<HTMLInputElement>('#SettingForm input[name="' + name + '"]');
				return dom ?? Main.dummyInputNode;
			}

			const setting: Setting		= new Setting;
			setting.RomMapping		= DomUtility.GetFormRadio<Emulator.RomMapping>('#SettingForm', 'mapping', {
				'lorom': Emulator.RomMapping.LoROM,
				'hirom': Emulator.RomMapping.HiROM,
			}, Emulator.RomMapping.LoROM);
			setting.FastRom			= Main.GetFormBoolean(getDom('fastrom'));
			setting.StatusFlagE		= Main.GetFormBoolean(getDom('eflag'));
			setting.StartAddress		= Main.GetFormNumber( getDom('startpc'), 16, 0x008000);
			setting.MaxCycle		= Main.GetFormNumber( getDom('cycle'), 10, 10000);
			setting.EmulationStopSTP	= Main.GetFormBoolean(getDom('stops'));
			setting.EmulationStopWAI	= Main.GetFormBoolean(getDom('stopw'));
			setting.EmulationStopBRK	= Main.GetFormBoolean(getDom('stopb'));
			setting.EmulationStopCOP	= Main.GetFormBoolean(getDom('stopc'));
			setting.EmulationStopWDM	= Main.GetFormBoolean(getDom('stopr'));
			setting.Source			= (Main.Dom.AssemblerSource as HTMLInputElement).value;

			return setting;
		}
		private static GetFormBoolean(dom: HTMLInputElement): boolean{
			return dom.checked;
		}
		private static GetFormNumber(dom: HTMLInputElement, base: number, defaultValue: number): number{
			const value	= parseInt(dom.value, base);
			return (isNaN(value))? defaultValue : value;
		}

		private static SetSetting(setting: Setting){
			function getDom(name: string, value: string | null=null): HTMLInputElement{
				let query	= '#SettingForm input[name="' + name + '"]';
				if(value !== null){
					query	+= '[value="' + value + '"]';
				}
				const dom	= document.querySelector<HTMLInputElement>(query);
				return dom ?? Main.dummyInputNode;
			}

			Main.SetFormBoolean(    getDom('mapping', 'lorom'),	setting.RomMapping === Emulator.RomMapping.LoROM);
			Main.SetFormBoolean(    getDom('mapping', 'hirom'),	setting.RomMapping === Emulator.RomMapping.HiROM);
			Main.SetFormBoolean(    getDom('fastrom'),		setting.FastRom);
			Main.SetFormBoolean(    getDom('eflag'),		setting.StatusFlagE);
			Main.SetFormHexadecimal(getDom('startpc'),		setting.StartAddress);
			Main.SetFormInteger(    getDom('cycle'),		setting.MaxCycle);
			Main.SetFormBoolean(    getDom('stopw'),		setting.EmulationStopWAI);
			Main.SetFormBoolean(    getDom('stopb'),		setting.EmulationStopBRK);
			Main.SetFormBoolean(    getDom('stopc'),		setting.EmulationStopCOP);
			Main.SetFormBoolean(    getDom('stopr'),		setting.EmulationStopWDM);

			if(setting.Source.length > 0){
				(Main.Dom.AssemblerSource as HTMLInputElement).value	= setting.Source;
			}
		}
		private static SetFormBoolean(dom: HTMLInputElement, value: boolean){
			dom.checked	= value;
		}
		private static SetFormInteger(dom: HTMLInputElement, value: number){
			dom.value	= value.toString();
		}
		private static SetFormHexadecimal(dom: HTMLInputElement, value: number){
			const digit	= parseInt(dom.getAttribute('maxlength') ?? '0') ?? 0;
			dom.value	= Utility.Format.ToHexString(value, digit);
		}

		private static GetUrlParameter(): Setting | null{
			if(location.search.length <= 0){
				return null;
			}

			const search	= (location.search[0] === '?')? location.search.substring(1) : location.search;
			const parameters= search.split('&');
			const setting	= new Setting();

			function split(parameter: string): [string, string]{
				const index	= parameter.indexOf('=');
				if(index >= 1){
					const left	= parameter.substring(0, index);
					const right	= parameter.substring(index + 1);
					return [left, right];
				}
				else{
					return [parameter, ''];
				}
			}
			function parameterToBoolean(parameter: string, defaultValue: boolean): boolean{
				const num	= parseInt(parameter);
				if(!isNaN(num)){
					return !!num;
				}
				else if(parameter.toUpperCase() === 'TRUE'){
					return true;
				}
				else if(parameter.toUpperCase() === 'FALSE'){
					return false;
				}
				return defaultValue;
			}
			function parameterToInteger(parameter: string, base: number, defaultValue: number): number{
				const num	= parseInt(parameter, base);
				if(!isNaN(num)){
					return num;
				}
				return defaultValue;
			}

			for(const index in parameters){
				const [key, value]	= split(parameters[index]);
				switch(key){
					case 'rm':{
						switch(value){
							case 'lo':
								setting.RomMapping	= Emulator.RomMapping.LoROM;
								break;
							case 'hi':
								setting.RomMapping	= Emulator.RomMapping.HiROM;
								break;
						}
						break;
					}
					case 'fr':
						setting.FastRom			= parameterToBoolean(value, setting.FastRom);
						break;
					case 'sfe':
						setting.StatusFlagE		= parameterToBoolean(value, setting.StatusFlagE);
						break;
					case 'sa':
						setting.StartAddress		= parameterToInteger(value, 16, setting.StartAddress);
						break;
					case 'mc':
						setting.MaxCycle		= parameterToInteger(value, 10, setting.MaxCycle);
						break;
					case 'esw':
						setting.EmulationStopWAI	= parameterToBoolean(value, setting.EmulationStopWAI);
						break;
					case 'esb':
						setting.EmulationStopBRK	= parameterToBoolean(value, setting.EmulationStopBRK);
						break;
					case 'esc':
						setting.EmulationStopCOP	= parameterToBoolean(value, setting.EmulationStopCOP);
						break;
					case 'esr':
						setting.EmulationStopWDM	= parameterToBoolean(value, setting.EmulationStopWDM);
						break;
					case 'src':
						setting.Source			= Main.DecodeSource(value);
						break;
				}
			}

			return setting;
		}
		public static GetCopyUrl(): string{
			let url		= location.origin + location.pathname;

			const setting	= Main.GetSetting();

			function booleanToParameter(value: boolean): string{
				return (value)? '1' : '0';
			}

			url		+= `?rm=${ (setting.RomMapping === Emulator.RomMapping.HiROM)? 'hi' : 'lo' }`;
			url		+= `&fr=${ booleanToParameter(setting.FastRom) }`;
			url		+= `&sfe=${ booleanToParameter(setting.StatusFlagE) }`;
			url		+= `&sa=${ Utility.Format.ToHexString(setting.StartAddress, 6) }`;
			url		+= `&mc=${ setting.MaxCycle.toString() }`;
			url		+= `&esw=${ booleanToParameter(setting.EmulationStopWAI) }`;
			url		+= `&esb=${ booleanToParameter(setting.EmulationStopBRK) }`;
			url		+= `&esc=${ booleanToParameter(setting.EmulationStopCOP) }`;
			url		+= `&esr=${ booleanToParameter(setting.EmulationStopWDM) }`;
			url		+= `&src=${ Main.EncodeSource(setting.Source) }`;

			return url;
		}

		private static EncodeSource(src: string): string{
			const urlEncodedSource	= encodeURIComponent(src);
			return urlEncodedSource;
		}
		private static DecodeSource(src: string): string{
			const urlDecodedSource	= decodeURIComponent(src);
			return urlDecodedSource;
		}

		private static DumpCpuLog(cpu: Emulator.Cpu){
			// for debug
			for(let i = 0; i < cpu.Logs.length; i++){
				const instructionLog	= cpu.Logs[i];
				console.log(`[${i}] ${instructionLog.GetLogString()}`);
				for(let j = 0; j < instructionLog.AccessLog.length; j++){
					const accessLog	= instructionLog.AccessLog[j];
					console.log('  ' + Emulator.StepLog.AccessLogToString(accessLog));
				}
			}
		}

		private static UpdateSelectedViewer(){
			const selected	= DomUtility.GetFormRadio<ViewerMode>('#ViewerSelect', 'viewer', {
				textlog:	ViewerMode.TextLog,
				tablelog:	ViewerMode.TableLog,
				timeline:	ViewerMode.Timeline,
				heatmap:	ViewerMode.Heatmap,
				written:	ViewerMode.Written,
			}, ViewerMode.TableLog);

			const viewerList	= [
				Main.Dom.ViewerTextLog,
				Main.Dom.ViewerTableLog,
				Main.Dom.ViewerTimeline,
				Main.Dom.ViewerHeatmap,
				Main.Dom.ViewerWritten,
			];

			viewerList.forEach((viewer) => {
				viewer.classList.add('hide');
			});

			let selectedDom		= viewerList[selected];
			selectedDom.classList.remove('hide');
		}
		private static CheckSelectedViewer(element: HTMLElement){
			element.addEventListener('change', (e: Event) => {
				Main.UpdateSelectedViewer();
			});
		}

		private static ClearResultViewerFunctions: (() => void)[]	= [
			Main.ClearResultViewer_TextLog,
			Main.ClearResultViewer_TableLog,
			Main.ClearResultViewer_Timeline,
			Main.ClearResultViewer_Heatmap,
			Main.ClearResultViewer_Written,
		];
		private static UpdateResultViewerFunctions: ((cpu: Emulator.Cpu) => void)[]	= [
			Main.UpdateResultViewer_TextLog,
			Main.UpdateResultViewer_TableLog,
			Main.UpdateResultViewer_Timeline,
			Main.UpdateResultViewer_Heatmap,
			Main.UpdateResultViewer_Written,
		];
		private static ClearResultViewer(){
			const clearText	= '---';
			Main.Dom.ResultStatistics_Step.textContent	= clearText;
			Main.Dom.ResultStatistics_Cycle.textContent	= clearText;
			Main.Dom.ResultStatistics_Master.textContent	= clearText;

			Main.ClearResultViewerFunctions.forEach((clearFunction) => {
				try{
					clearFunction();
				}
				catch{}
			});
		}
		private static UpdateResultViewer(cpu: Emulator.Cpu){
			Main.ClearResultViewer();

			Main.Dom.ResultStatistics_Step.textContent	= cpu.Logs.length.toString();
			Main.Dom.ResultStatistics_Cycle.textContent	= cpu.CpuCycleCounter.toString();
			Main.Dom.ResultStatistics_Master.textContent	= cpu.MasterCycleCounter.toString();

			Main.UpdateResultViewerFunctions.forEach((updateFunction) => {
				try{
					updateFunction(cpu);
				}
				catch{}
			});
		}
		private static ClearResultViewer_TextLog(){
			Main.ClearTextarea(Main.Dom.ViewerTextLog_Log);
		}
		private static UpdateResultViewer_TextLog(cpu: Emulator.Cpu){
			let logStrings: string[]	= [];

			for(let s = 0; s < cpu.Logs.length; s++){
				const step	= cpu.Logs[s];
				logStrings.push(step.GetLogString());

				for(let c = 0; c < step.AccessLog.length; c++){
					const accessLog	= step.AccessLog[c];
					logStrings.push('  ' + Emulator.StepLog.AccessLogToString(accessLog));
				}
			}

			Main.SetTextareaStrings(Main.Dom.ViewerTextLog_Log, logStrings);
		}
		private static ClearResultViewer_TableLog(){
			// TODO: Implements
		}
		private static UpdateResultViewer_TableLog(cpu: Emulator.Cpu){
			// TODO: Implements
		}
		private static ClearResultViewer_Timeline(){
			// TODO: Implements
		}
		private static UpdateResultViewer_Timeline(cpu: Emulator.Cpu){
			// TODO: Implements
		}
		private static ClearResultViewer_Heatmap(){
			// TODO: Implements
		}
		private static UpdateResultViewer_Heatmap(cpu: Emulator.Cpu){
			// TODO: Implements
		}
		private static ClearResultViewer_Written(){
			const tableBody	= document.querySelector<HTMLElement>('#ViewerWritten_Table tbody');
			DomUtility.RemoveCildren(tableBody);

			if(tableBody){
				const row		= document.createElement('tr');
				tableBody.appendChild(row);

				function appendDummyChild(){
					const cell		= document.createElement('td');
					cell.textContent	= '---'
					cell.classList.add('center');
					row.appendChild(cell);
				}
				appendDummyChild();
				appendDummyChild();
				appendDummyChild();
				appendDummyChild();
				appendDummyChild();
			}
		}
		private static UpdateResultViewer_Written(cpu: Emulator.Cpu){
			const tableBody	= document.querySelector<HTMLElement>('#ViewerWritten_Table tbody');
			if(!tableBody){
				return;
			}

			const writeAccess: Viewer_Written_Log[]			= [];
			const writeHistory: {[address: number]: number[]}	= {};

			// take out write access
			for(let s = 0; s < cpu.Logs.length; s++){
				const step	= cpu.Logs[s];
				let cycle	= step.MasterCycle;

				for(let c = 0; c < step.AccessLog.length; c++){
					const accessLog	= step.AccessLog[c];

					switch(accessLog.Type){
						case Emulator.AccessType.Write:
						case Emulator.AccessType.WriteDummy:
						case Emulator.AccessType.PushStack:
						{
							const history	= writeHistory[accessLog.AddressBus] ?? [];
							writeHistory[accessLog.AddressBus]	= history;

							writeAccess.push({
								Region: accessLog.Region,
								Address: accessLog.AddressBus,
								Value: accessLog.DataBus,
								Cycle: cycle,
								Type: accessLog.Type,
								Repeat: history.length,
							});
							history.push(accessLog.DataBus);
							break;
						}
					}

					cycle	+= accessLog.Cycle;
				}
			}

			if(writeAccess.length <= 0){
				return;
			}
			DomUtility.RemoveCildren(tableBody);

			writeAccess.sort((a, b) => a.Address - b.Address);

			// add rows
			function createRow(parent: HTMLTableRowElement, className: string): HTMLTableCellElement{
				const cell		= document.createElement('td');
				parent.appendChild(cell);
				cell.classList.add(className);
				return cell
			}
			function addHistory(cell: HTMLTableCellElement, content: string, highlight: boolean){
				const node		= document.createElement('span');
				node.textContent	= content;
				if(highlight){
					node.classList.add('highlight');
				}
				cell.appendChild(node);
			}
			for(let i = 0; i < writeAccess.length; i++){
				const access		= writeAccess[i];
				const history		= writeHistory[access.Address] ?? [];
				if(access.Repeat < (history.length - 1)){
					continue;
				}

				const row		= document.createElement('tr');
				const cellRegion	= createRow(row, 'region');
				const cellAddress	= createRow(row, 'address');
				const cellValue		= createRow(row, 'value');
				const cellTiming	= createRow(row, 'timing');
				const cellHistory	= createRow(row, 'history');
				tableBody.appendChild(row);

				cellRegion.textContent	= Emulator.AccessRegion[access.Region];
				cellAddress.textContent	= `$${Utility.Format.ToHexString(access.Address, 6)}`;
				cellValue.textContent	= `$${Utility.Format.ToHexString(access.Value, 2)}`;
				cellTiming.textContent	= `${access.Cycle}`;

				let isFirst		= true;
				for(let h = 0; h < history.length; h++){
					if(!isFirst){
						addHistory(cellHistory, ', ', false);
					}
					isFirst	= false;
					addHistory(cellHistory, `$${Utility.Format.ToHexString(history[h], 2)}`, access.Repeat === h);
				}
			}

		}

	}

	class Setting{
		RomMapping: Emulator.RomMapping	= Emulator.RomMapping.LoROM;
		FastRom: boolean		= false;
		StatusFlagE: boolean		= false;
		StartAddress: number		= 0x008000;
		MaxCycle: number		= 10000;
		EmulationStopSTP: boolean	= true;
		EmulationStopWAI: boolean	= false;
		EmulationStopBRK: boolean	= false;
		EmulationStopCOP: boolean	= false;
		EmulationStopWDM: boolean	= false;
		Source: string			= '';

		public GetEmulationStopInstruction(instruction: Emulator.Instruction): boolean{
			switch(instruction){
				case Emulator.Instruction.STP:	return this.EmulationStopSTP;
				case Emulator.Instruction.WAI:	return this.EmulationStopWAI;
				case Emulator.Instruction.BRK:	return this.EmulationStopBRK;
				case Emulator.Instruction.COP:	return this.EmulationStopCOP;
				case Emulator.Instruction.WDM:	return this.EmulationStopWDM;
			}
			return false;
		}
	}

	class DomUtility{
		public static RemoveCildren(element: HTMLElement | null){
			if(!element){
				return;
			}
			for(let i = element.children.length - 1; 0 <= i; i--){
				element.children[i].remove();
			}
		}

		public static GetFormRadio<ReturnType>(selector: string, name: string, values: {[key: string]: ReturnType}, defaultValue: ReturnType): ReturnType{
			for(const key in values){
				const dom	= document.querySelector(`${selector} input[name="${name}"][value="${key}"]`);
				if((dom instanceof HTMLInputElement) && dom.checked){
					return values[key];
				}
			}
			return defaultValue;
		}

		public static ApplyDomEvents<ElementType extends Element>(selector: string, domEvent: (element: ElementType) => void){
			const doms	= document.querySelectorAll<ElementType>(selector);
			doms.forEach((dom) => {
				domEvent(dom);
			})
		}

		// Allow tab input
		public static AllowTab(element: HTMLInputElement){
			element.addEventListener('keydown', (e: KeyboardEvent) => {
				DomUtility.AllowTabEvent(element, e);
			});
		}
		private static AllowTabEvent(element: HTMLInputElement, e: KeyboardEvent){
			if(e.key !== 'Tab'){
				return;
			}
			e.preventDefault();

			let value		= element.value;
			const selectStart	= element.selectionStart ?? 0;
			const selectEnd		= element.selectionEnd ?? 0;
			const selectLeft	= value.substring(0, selectStart);
			let selectContent	= value.substring(selectStart, selectEnd);
			const selectRight	= value.substring(selectEnd);
			if(!e.shiftKey){
				const replaceBefore	= selectContent.length;
				selectContent		= selectContent.replace(/\n/g, '\n\t');
				const replaceCount	= selectContent.length - replaceBefore;

				value			= selectLeft + '\t' + selectContent + selectRight;
				element.value		= value;
				element.selectionStart	= selectStart + 1;
				element.selectionEnd	= selectEnd + 1 + replaceCount;
			}
			else{
				const replaceBefore	= selectContent.length;
				selectContent		= selectContent.replace(/\n\t/g, '\n');
				selectContent		= selectContent.replace(/^\t/g, '');
				const replaceCount	= replaceBefore - selectContent.length;

				value			= selectLeft + selectContent + selectRight;
				element.value		= value;
				element.selectionStart	= selectStart;
				element.selectionEnd	= selectEnd - replaceCount;
			}
		}

		private static FormattedInputSkipKey(key: string): boolean{
			switch(key){
				case 'Delete':
				case 'Backspace':
				case 'Shift':
				case 'Control':
				case 'Alt':
				case 'Tab':
					return true;
			}
			if(key.indexOf('Arrow') === 0){
				return true;
			}
			if(key.match(/^F\d+$/i)){
				return true;
			}
			return false;
		}

		// Input in integer format
		public static IntegerInput(element: HTMLInputElement){
			element.addEventListener('keydown', (e: KeyboardEvent) => {
				DomUtility.IntegerInputKeydownEvent(element, e);
			});
			element.addEventListener('change', (e: Event) => {
				DomUtility.IntegerInputChangeEvent(element);
			});
			DomUtility.IntegerInputChangeEvent(element);
		}
		private static IntegerInputKeydownEvent(element: HTMLInputElement, e: KeyboardEvent){
			const key	= e.key;
			if(e.getModifierState("Control")){
				return;
			}
			else if(DomUtility.FormattedInputSkipKey(key)){
				return;
			}
			else if(key.length > 1){
				e.preventDefault();
			}

			const match	= key.match(/^\d$/i);
			if(!match){
				e.preventDefault();
			}
		}
		private static IntegerInputChangeEvent(element: HTMLInputElement){
			const value	= element.value;

			const match	= value.match(/^[\d]+$/i);
			if(match){
				const converted		= parseInt(match[0]);
				element.setAttribute('_previous', converted.toString());
			}
			else{
				const previousValue	= parseInt(element.getAttribute('_previous') ?? '0') ?? 0;
				const setValue		= Utility.Format.ToHexString(previousValue);
				element.value		= setValue;
			}
		}

		// Input in hexadecimal format
		public static HexadecimalInput(element: HTMLInputElement){
			element.addEventListener('keydown', (e: KeyboardEvent) => {
				DomUtility.HexadecimalInputKeydownEvent(element, e);
			});
			element.addEventListener('change', (e: Event) => {
				DomUtility.HexadecimalInputChangeEvent(element);
			});
			DomUtility.HexadecimalInputChangeEvent(element);
		}
		private static HexadecimalInputKeydownEvent(element: HTMLInputElement, e: KeyboardEvent){
			const key	= e.key;
			if(e.getModifierState("Control")){
				return;
			}
			else if(DomUtility.FormattedInputSkipKey(key)){
				return;
			}
			else if(key.length > 1){
				e.preventDefault();
			}

			const match	= key.match(/^[\dA-F]$/i);
			if(!match){
				e.preventDefault();
			}
		}
		private static HexadecimalInputChangeEvent(element: HTMLInputElement){
			const value	= element.value;
			const digit	= parseInt(element.getAttribute('maxlength') ?? '0') ?? 0;

			const match	= value.match(/^[\dA-F]+$/i);
			if(match){
				const converted		= parseInt(match[0], 16);
				element.setAttribute('_previous', Utility.Format.ToHexString(converted, digit));
			}
			else{
				const previousValue	= parseInt(element.getAttribute('_previous') ?? '0', 16) ?? 0;
				const setValue		= Utility.Format.ToHexString(previousValue, digit);
				element.value		= setValue;
			}
		}
	}

	enum ViewerMode{
		TextLog,
		TableLog,
		Timeline,
		Heatmap,
		Written
	}

	class Viewer_Written_Log{
		Region: Emulator.AccessRegion	= Emulator.AccessRegion.MainRAM;
		Address: number			= 0;
		Value: number			= 0;
		Cycle: number			= 0;
		Type: Emulator.AccessType	= Emulator.AccessType.Write;
		Repeat: number			= 0;
	}

}


