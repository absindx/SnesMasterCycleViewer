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
		public static ToHexString(v: number, digit: number = 2): string{
			const s	= '0'.repeat(digit) + v.toString(16);
			return s.substring(s.length - digit).toUpperCase();
		}
		public static PadSpace(str: string, length: number = 0): string{
			const l	= length - str.length;
			const s	= str + ((l > 0)? ' '.repeat(l) : '');
			return s;
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
		// TODO: Implements
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
			return (this.P >> 7) != 0;
		}
		public GetStatusFlagV(): boolean{
			return (this.P >> 6) != 0;
		}
		public GetStatusFlagM(): boolean{
			return (this.P >> 5) != 0;
		}
		public GetStatusFlagX(): boolean{
			return (this.P >> 4) != 0;
		}
		public GetStatusFlagD(): boolean{
			return (this.P >> 3) != 0;
		}
		public GetStatusFlagI(): boolean{
			return (this.P >> 2) != 0;
		}
		public GetStatusFlagZ(): boolean{
			return (this.P >> 1) != 0;
		}
		public GetStatusFlagC(): boolean{
			return (this.P >> 0) != 0;
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
		public SetStatusFlagM(b: boolean){
			this.SetStatusFlag(b, 5);
		}
		public SetStatusFlagX(b: boolean){
			this.SetStatusFlag(b, 4);
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
			this.SetStatusRegister(p);
		}
		public SetStatusRegister(p: number){
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
			if(!this.E){
				return;
			}

			// to emulation mode

			// set MX flags
			this.P	|= 0x30;

			// clear index registers high byte
			this.X	&= 0x00FF;
			this.Y	&= 0x00FF;

			// set the stack pointer high byte
			this.S	= (this.S & 0x00FF) | 0x0100;
		}

		public GetRegisterStringA(value: number = this.A): string{
			let digit	= (this.GetStatusFlagM())? 4 : 2;
			return Utility.Format.ToHexString(value, digit);
		}
		public GetRegisterStringX(value: number = this.X): string{
			let digit	= (this.GetStatusFlagX())? 4 : 2;
			return Utility.Format.ToHexString(value, digit);
		}
		public GetRegisterStringY(value: number = this.Y): string{
			let digit	= (this.GetStatusFlagX())? 4 : 2;
			return Utility.Format.ToHexString(value, digit);
		}

		public GetRelativeAddress(offset: number): number{
			return (this.PB << 16) + Utility.Type.ToWord(this.PC + offset);
		}
	};

	export class Memory{
		private AddressSpace: {[Address: number]: number}	= {};
		ROMMapping: ROMMapping	= ROMMapping.LoROM;
		IsFastROM: boolean	= false;

		AddressBus: number	= 0;
		DataBus: number		= 0;

		public ReadByte(address: number): MemoryReadResult{
			// TODO: hook I/O
			const data	= this.AddressSpace[address] ?? 0;
			const speed	= this.UpdateBus(address, data);
			const result: MemoryReadResult	= {
				Data: data,
				Speed: speed,
			};
			return result;
		}

		public WriteValue(address: number, data: number): MemoryWriteResult{
			// TODO: hook I/O
			const speed	= this.UpdateBus(address, data);
			this.AddressSpace[address]	= data;
			const result: MemoryWriteResult	= {
				Speed: speed,
			};
			return result;
		}

		private UpdateBus(address: number, data: number): AccessSpeed{
			// Reference:
			// 	https://wiki.superfamicom.org/memory-mapping

			address		= Utility.Type.ToLong(address);
			data		= Utility.Type.ToByte(data);

			let speed	= (this.IsFastROM)? AccessSpeed.Fast : AccessSpeed.Slow;

			const bank	= address >> 16;
			const page	= address && 0x00FFFF;
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
		CpuCycle: number		= 0;
		ExecuteCycle: number		= 0;
		InstructionLength: number	= 0;
		SourceLineNumber: number	= -1;
		Registers: Registers		= new Registers();
		AccessLog: AccessLog[]		= [];

		public GetLogString(): string{
			return `${Instruction[this.Instruction]} `
				+ `${Utility.Format.PadSpace(this.GetFormattedOperand(), 40)}`
				+ ` ; ${this.Registers.ToString()},CYC=${this.CpuCycle}`;
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
			const strOprRel		= Utility.Format.ToHexString(this.Registers.GetRelativeAddress(Utility.Type.ToChar(this.Operand1) + this.InstructionLength), 4);
			const strXycDst		= '$' + strOpr1B + Utility.Format.ToHexString(this.Registers.Y, 4);
			const strXycSrc		= '$' + strOpr2B + Utility.Format.ToHexString(this.Registers.X, 4);
			return [
				``,								// imp
				`A`,								// A
				``,								// S
				`#${strOpr1B}`,							// #imm8
				`#${strOpr1M}`,							// #immM
				`#${strOpr1X}`,							// #immX
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
				`$${strOpr1L} @ ${strLngAccess}`,				// long,X
				`$${strOprRel} @ ${Utility.Type.ToChar(this.Operand1)}`,	// rel
				`$${strOprRel} @ ${Utility.Type.ToShort(this.Operand1)}`,	// rlong
				`$${strOpr1B} @ ${strLngAccess}`,				// sr,S
				`$${strOpr1B} @ ${strIndAccess}`,				// (sr,S),Y
				`$${strOpr2B}, $${strOpr1B} @ ${strXycDst} <- ${strXycSrc}`,	// xyc	; src, dst
			][this.Addressing];
		}

		public GetExecuteCycle(): number{
			let cycle	= 0;
			for(let i = 0; i < this.AccessLog.length; i++){
				cycle	+= this.AccessLog[i].Cycle;
			}
			return cycle;
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
		DummyRead,
		DummyWrite,
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
	type MemoryReadResult = {
		Data: number;	// byte
		Speed: AccessSpeed;
	}
	type MemoryWriteResult = {
		Speed: AccessSpeed;
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

		/** true = Output log to console / false = Do not output log */
		public static Verbose: boolean				= false;

		public static Assemble(code: string): [DataChunk[] | null, ErrorMessage[]]{
			const lex	= new Assembler();

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
				sectionLog(`Error`);
				const consoleErrorLog	= (message: string) => {
					console.log('%c' + message, 'color: red');
				}
				if(Assembler.Verbose){
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
			this.NowAddress		= 0;
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
			const instructionMatch		= line.match(/^([A-Z]+)\s*(\.\s*([bwl]))?\s*(.*)/i);
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

		private GetErrorStrings(newline: string = '\n'): string[]{
			const errorStrings: string[]	= [];

			for(let i = 0; i < this.ErrorMessages.length; i++){
				const m	= this.ErrorMessages[i];
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
			const errorStrings	= this.GetErrorStrings();

			for(let i = 0; i < errorStrings.length; i++){
				print(errorStrings[i]);
			}
		}
	}

	type ErrorMessage = {
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

// Main program

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


