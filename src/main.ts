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
		// TODO: privatization, public for debugging
		Chunks: DataChunk[]	= [];

		Tokens: Token[]		= [];

		LabelList: { [Label: string]: Scope}	= {};
		PlusLabelList: ScopeLabel[]		= [];
		MinusLabelList: ScopeLabel[]		= [];
		Define					= {};
		NowAddress: number			= 0;
		NowScopeName: string			= '';
		NowDirectPage: number			= 0;

		ErrorMessages: ErrorMessage[]	= [];

		public static Assemble(code: string): DataChunk[] | ErrorMessage[]{
			let lex	= new Assembler();

			// Pass1: split to tokens
			if(!lex.SplitTokens(code)){
				// TODO: for DEBUG
				lex.DumpErrors();
				return lex.ErrorMessages;
			}
			lex.ResetLexicalStatus();

			// TODO: for DEBUG
			lex.DumpTokens();

			// Pass2: confirm the address
			// if(!lex.ConfirmAddress()){
			// 	return lex.ErrorMessages;
			// }

			// Pass3: generate binary
			// if(!lex.GenerateBinary()){
			// 	return lex.ErrorMessages;
			// }

			return lex.Chunks;
		}

		private ResetLexicalStatus(){
			this.NowAddress		= 0;
			this.NowScopeName	= '';
			this.NowDirectPage	= 0;
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

			function pushDataArray(tokenType: CodeTokenType){
				const splits	= Assembler.SplitAll(remain, [',', ' '], false);
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
				const scope			= new Scope();
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
				const label			= new ScopeLabel();
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
				case 'b':	addressingLength	= AddressingLength.Short;	break;
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
			// TODO: Implements
			return null;
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
			right	= reader.Remaining();

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
						list.push(item);
					}
					item	= '';
				}
				else{
					item	+= c;
				}
			}

			if((!skipBlank) || (item.length > 0)){
				list.push(item);
			}

			return list;
		}

		private static InstructionPatternList: InstructionPattern[] = [
		//	Pattern								Addressing							Fallback
		//	Label:	([^,]+)
			{Pattern: `(([^,]+),\\s*([^,]+))`,				Addressing: Emulator.Addressing.BlockMove,			Fallback: false	},	// "src, dst"
			{Pattern: `([Aa]])`,						Addressing: Emulator.Addressing.Accumulator,			Fallback: false	},	// "A"
			{Pattern: `(#(.+))`,						Addressing: Emulator.Addressing.Immediate8,			Fallback: true	},	// "#xx"	// #imm8 (REP, SEP, ...)
			{Pattern: `(#(.+))`,						Addressing: Emulator.Addressing.ImmediateMemory,		Fallback: true	},	// "#xx"	// #immM (LDA, STA, ...)
			{Pattern: `(#(.+))`,						Addressing: Emulator.Addressing.ImmediateIndex,			Fallback: false	},	// "#xx"	// #immX (LDX, STX, ...)
			{Pattern: `(\\(\\s*([^,]+)\\s*,\\s*[Xx]\\s*\\))`,		Addressing: Emulator.Addressing.DirectpageIndexedIndirectX,	Fallback: true	},	// "(xx, X)"	// dp
			{Pattern: `(\\(\\s*([^,]+)\\s*,\\s*[Xx]\\s*\\))`,		Addressing: Emulator.Addressing.AbsoluteIndexedIndirect,	Fallback: false	},	// "(xx, X)"	// abs
			{Pattern: `(\\(\\s*([^,]+)\\s*,\\s*[Ss]\\s*\\)\\s*,\\s*[Yy])`,	Addressing: Emulator.Addressing.StackRelativeIndirectIndexedY,	Fallback: false	},	// "(xx, S), Y"
			{Pattern: `(\\(\\s*([^,]+)\\s*\\)\\s*,\\s*[Yy])`,		Addressing: Emulator.Addressing.DirectpageIndirectIndexedY,	Fallback: false	},	// "(xx), Y"
			{Pattern: `(\\[\\s*([^,]+)\\s*\\]\\s*,\\s*[Yy])`,		Addressing: Emulator.Addressing.DirectpageIndirectLongIndexedY,	Fallback: false	},	// "[xx], Y"
			{Pattern: `(\\(\\s*([^,]+)\\s*\\))`,				Addressing: Emulator.Addressing.DirectpageIndirect,		Fallback: true	},	// "(xx)"	// dp
			{Pattern: `(\\(\\s*([^,]+)\\s*\\))`,				Addressing: Emulator.Addressing.AbsoluteIndirect,		Fallback: false	},	// "(xx)"	// abs
			{Pattern: `(\\[\\s*([^,]+)\\s*\\])`,				Addressing: Emulator.Addressing.AbsoluteIndirectLong,		Fallback: true	},	// "[xx]"	// dp
			{Pattern: `(\\[\\s*([^,]+)\\s*\\])`,				Addressing: Emulator.Addressing.DirectpageIndirectLong,		Fallback: false	},	// "[xx]"	// abs
			{Pattern: `(([^,]+)\\s*,\\s*[Xx])`,				Addressing: Emulator.Addressing.DirectpageIndexedX,		Fallback: false	},	// "xx, X"	// dp, abs, long
			{Pattern: `(([^,]+)\\s*,\\s*[Yy])`,				Addressing: Emulator.Addressing.DirectpageIndexedY,		Fallback: true	},	// "xx, Y"	// dp
			{Pattern: `(([^,]+)\\s*,\\s*[Yy])`,				Addressing: Emulator.Addressing.AbsoluteIndexedY,		Fallback: false	},	// "xx, Y"	// abs
			{Pattern: `(([^,]+)\\s*,\\s*[Ss])`,				Addressing: Emulator.Addressing.StackRelative,			Fallback: false	},	// "xx, S"
			{Pattern: `(([^,]+))`,						Addressing: Emulator.Addressing.Relative,			Fallback: true	},	// "xx"		// rel
			{Pattern: `(([^,]+))`,						Addressing: Emulator.Addressing.RelativeLong,			Fallback: true	},	// "xx"		// rlong
			{Pattern: `(([^,]+))`,						Addressing: Emulator.Addressing.Directpage,			Fallback: true	},	// "xx"		// dp
			{Pattern: `(([^,]+))`,						Addressing: Emulator.Addressing.Absolute,			Fallback: true	},	// "xx"		// abs
			{Pattern: `(([^,]+))`,						Addressing: Emulator.Addressing.AbsoluteLong,			Fallback: false	},	// "xx"		// long
			{Pattern: `(())`,						Addressing: Emulator.Addressing.Stack,				Fallback: true	},	// ""
			{Pattern: `(())`,						Addressing: Emulator.Addressing.Implied,			Fallback: false	},	// ""
		];

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

		// TODO: for DEBUG
		private DumpTokens(){
			for(let i = 0; i < this.Tokens.length; i++){
				const t	= this.Tokens[i];
				let l	= `[${i}] Line:${t.Line} $${Utility.Format.ToHexString(t.Address, 6)} ${CodeTokenType[t.TokenType]}: #${t.Options.length} ${t.Options}`;

				if(t.Options[0] instanceof InstructionToken){
					l	+= '\n' + t.Options[0].ToString();
				}

				console.log(l);
			}
		}
		// TODO: for DEBUG
		private DumpErrors(){
			for(let i = 0; i < this.ErrorMessages.length; i++){
				const m	= this.ErrorMessages[i];
				console.log(`[${i}] Line:${m.Line} ${m.Message}` + '\n' + m.Source);
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
		Short,
		Word,
		Long,
	}

	class Scope{
		Address: number	= 0;
		LocalScope: { [LocalLabel: string]: ScopeLabel}	= {};
	}
	class ScopeLabel{
		Address: number	= 0;
	}

	export type DataChunk = {
		Address: number,
		Data: Uint8Array,
	};

	class InstructionPattern{
		Pattern: string			= '';
		Addressing: Emulator.Addressing	= Emulator.Addressing.Implied;
		Fallback: boolean		= true;
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
		.org $008000	; code start
EmulationRST:
		SEI		; 78
		REP	#$CB	; C2 CB
		XCE		; FB
		SEP	#$34	; E2
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
		.org $008040
Test:	.Start
;.Inf
.Inf		JML	.Inf	; 5C 40 80 00
		MVP	$7E, $7F; 44 7F 7E	; src, dst ($7F <- $7E)
+
		STP		; DB

		.i8
		LDX.b	#$1234	; A2 34
		LDX.w	#$5678	; A2 78 56
		LDX	#$ABCD	; A2 34
		.i16
		LDX.b	#$1234	; A2 34
		LDX.w	#$5678	; A2 78 56
		LDX	#$ABCD	; A2 78 56
		.i8
		LDX	#$1234	; A2 34

		.i8
		LDY.b	#$1234	; A0 34
		LDY.w	#$5678	; A0 78 56
		LDY	#$ABCD	; A0 34
		.i16
		LDY.b	#$1234	; A0 34
		LDY.w	#$5678	; A0 78 56
		LDY	#$ABCD	; A0 78 56
		.i8
		LDY	#$1234	; A0 34

		PEA	Test	; F4 40 80
		RTS		; 60
	`;
	const assemble	= Assembler.Assembler.Assemble(code);
}


