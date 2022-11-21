//--------------------------------------------------
// SNES master cycle viewer
//--------------------------------------------------

namespace Utility{
	export class Type{
		private static Modulo(v: number, m: number): number{
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
			v	= this.ToByte(v);
			if(v >= (2 ** 15)){
				return -(2 ** 16) + v;
			}
			return v;
		}
	}
	export class Format{
		public static ToHexString(v: number, digit: number = 2): string{
			const s	= '0'.repeat(digit) + v.toString(16);
			return s.substring(s.length - digit).toUpperCase();
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
				+ `P=${strP} ${this.ToStringStatus()}`
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
	};

	export class Memory{
		// TODO: Implements
	}

	export enum Addressing{
		Implied,				// imp
		Accumulator,				// A
		Stack,					// S
		Immediate,				// #imm
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
	export const InstructionTable	= {
	//    Mnemonic imp         S           dp          dp,Y        (dp,X)      [dp]        abs         abs,Y       (abs,X)     long        rel         sr,S        xyc         Flags
	//                   A           #imm        dp,X        (dp)        (dp),Y      [dp],Y      abs,X       (abs)       [abs]       long,X      rlong       (sr,S),Y
		ADC: [ null, null, null, 0x69, 0x65, 0x75, null, 0x72, 0x61, 0x71, 0x67, 0x77, 0x6D, 0x7D, 0x79, null, null, null, 0x6F, 0x7F, null, null, 0x63, 0x73, null ],	// NV----ZC
		AND: [ null, null, null, 0x29, 0x25, 0x35, null, 0x32, 0x21, 0x31, 0x27, 0x37, 0x2D, 0x3D, 0x39, null, null, null, 0x2F, 0x3F, null, null, 0x23, 0x33, null ],	// N-----Z-
		ASL: [ null, 0x0A, null, null, 0x06, 0x16, null, null, null, null, null, null, 0x0E, 0x1E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		BCC: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null ],	// --------
		BCS: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null ],	// --------
		BEQ: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF0, null, null, null, null ],	// --------
	//	BGE: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null ],	// --------
		BIT: [ null, null, null, 0x89, 0x24, 0x34, null, null, null, null, null, null, 0x2C, 0x3C, null, null, null, null, null, null, null, null, null, null, null ],	// NV----Z- (N=opr.bit7, V=opr.bit6) / #imm : ------Z-
	//	BLT: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null ],	// --------
		BMI: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x30, null, null, null, null ],	// --------
		BNE: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xD0, null, null, null, null ],	// --------
		BPL: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x10, null, null, null, null ],	// --------
		BRA: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x80, null, null, null, null ],	// --------
		BRK: [ null, null, 0x00, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI-- (D=0, I=1)
		BRL: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x82, null, null, null ],	// --------
		BVC: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x50, null, null, null, null ],	// --------
		BVS: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x70, null, null, null, null ],	// --------
		CLC: [ 0x18, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C (C=0)
		CLD: [ 0xD8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----D--- (D=0)
		CLI: [ 0x58, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -----I-- (I=0)
		CLV: [ 0xB8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -V------ (V=0)
	//	CMA: [ null, null, null, 0xC9, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null ],	// N-----ZC
		CMP: [ null, null, null, 0xC9, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null ],	// N-----ZC
		COP: [ null, null, 0x02, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----DI-- (D=0, I=1)
		CPX: [ null, null, null, 0xE0, 0xE4, null, null, null, null, null, null, null, 0xEC, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
		CPY: [ null, null, null, 0xC0, 0xC4, null, null, null, null, null, null, null, 0xCC, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC
	//	DEA: [ null, 0x3A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		DEC: [ null, 0x3A, null, null, 0xC6, 0xD6, null, null, null, null, null, null, 0xCE, 0xDE, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		DEX: [ 0xCA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		DEY: [ 0x88, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		EOR: [ null, null, null, 0x49, 0x45, 0x55, null, 0x52, 0x41, 0x51, 0x47, 0x57, 0x4D, 0x5D, 0x59, null, null, null, 0x4F, 0x5F, null, null, 0x43, 0x53, null ],	// N-----Z-
	//	INA: [ null, 0x1A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		INC: [ null, 0x1A, null, null, 0xE6, 0xF6, null, null, null, null, null, null, 0xEE, 0xFE, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		INX: [ 0xE8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		INY: [ 0xC8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		JML: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xDC, 0x5C, null, null, null, null, null, null ],	// --------
	//	JMP: [ null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, 0x6C, 0x7C, 0xDC, 0x5C, null, null, null, null, null, null ],	// --------
		JMP: [ null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, 0x6C, 0x7C, null, null, null, null, null, null, null, null ],	// --------
		JSL: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x22, null, null, null, null, null, null ],	// --------
	//	JSR: [ null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, 0xFC, null, 0x22, null, null, null, null, null, null ],	// --------
		JSR: [ null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, 0xFC, null, null, null, null, null, null, null, null ],	// --------
		LDA: [ null, null, null, 0xA9, 0xA5, 0xB5, null, 0xB2, 0xA1, 0xB1, 0xA7, 0xB7, 0xAD, 0xBD, 0xB9, null, null, null, 0xAF, 0xBF, null, null, 0xA3, 0xB3, null ],	// N-----Z-
		LDX: [ null, null, null, 0xA2, 0xA6, null, 0xB6, null, null, null, null, null, 0xAE, null, 0xBE, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		LDY: [ null, null, null, 0xA0, 0xA4, 0xB4, null, null, null, null, null, null, 0xAC, 0xBC, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		LSR: [ null, 0x4A, null, null, 0x46, 0x56, null, null, null, null, null, null, 0x4E, 0x5E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----ZC (N=0)
		MVN: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x54 ],	// --------
		MVP: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x44 ],	// --------
		NOP: [ 0xEA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		ORA: [ null, null, null, 0x09, 0x05, 0x15, null, 0x12, 0x01, 0x11, 0x07, 0x17, 0x0D, 0x1D, 0x19, null, null, null, 0x0F, 0x1F, null, null, 0x03, 0x13, null ],	// N-----Z-
		PEA: [ null, null, null, null, null, null, null, null, null, null, null, null, 0xF4, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PEI: [ null, null, null, null, null, null, null, 0xD4, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PER: [ null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x62, null, null, null ],	// --------
		PHA: [ null, null, 0x48, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PHB: [ null, null, 0x8B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PHD: [ null, null, 0x0B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PHK: [ null, null, 0x4B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PHP: [ null, null, 0x08, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PHX: [ null, null, 0xDA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PHY: [ null, null, 0x5A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		PLA: [ null, null, 0x68, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		PLB: [ null, null, 0xAB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		PLD: [ null, null, 0x2B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		PLP: [ null, null, 0x28, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC (I=1)
		PLX: [ null, null, 0xFA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		PLY: [ null, null, 0x7A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		REP: [ null, null, null, 0xC2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC (I=1)
		ROL: [ null, 0x2A, null, null, 0x26, 0x36, null, null, null, null, null, null, 0x2E, 0x3E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		ROR: [ null, 0x6A, null, null, 0x66, 0x76, null, null, null, null, null, null, 0x6E, 0x7E, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		RTI: [ null, null, 0x40, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC (I=1)
		RTL: [ null, null, 0x6B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		RTS: [ null, null, 0x60, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		SBC: [ null, null, null, 0xE9, 0xE5, 0xF5, null, 0xF2, 0xE1, 0xF1, 0xE7, 0xF7, 0xED, 0xFD, 0xF9, null, null, null, 0xEF, 0xFF, null, null, 0xE3, 0xF3, null ],	// N-----ZC
		SEC: [ 0x38, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C (C=1)
		SED: [ 0xF8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// ----D--- (D=1)
		SEI: [ 0x78, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -----I-- (I=1)
		SEP: [ null, null, null, 0xE2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// NVMXDIZC (I=1)
		STA: [ null, null, null, null, 0x85, 0x95, null, 0x92, 0x81, 0x91, 0x87, 0x97, 0x8D, 0x9D, 0x99, null, null, null, 0x8F, 0x9F, null, null, 0x83, 0x93, null ],	// --------
		STP: [ 0xDB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		STX: [ null, null, null, null, 0x86, null, 0x96, null, null, null, null, null, 0x8E, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		STY: [ null, null, null, null, 0x84, 0x94, null, null, null, null, null, null, 0x8C, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		STZ: [ null, null, null, null, 0x64, 0x74, null, null, null, null, null, null, 0x9C, 0x9E, null, null, null, null, null, null, null, null, null, null, null ],	// --------
	//	SWA: [ 0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
	//	TAD: [ 0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
	//	TAS: [ 0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		TAX: [ 0xAA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TAY: [ 0xA8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TCD: [ 0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TCS: [ 0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
	//	TDA: [ 0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TDC: [ 0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TRB: [ null, null, null, null, 0x14, null, null, null, null, null, null, null, 0x1C, null, null, null, null, null, null, null, null, null, null, null, null ],	// ------Z-
		TSB: [ null, null, null, null, 0x04, null, null, null, null, null, null, null, 0x0C, null, null, null, null, null, null, null, null, null, null, null, null ],	// ------Z-
	//	TSA: [ 0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TSC: [ 0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TSX: [ 0xBA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TXA: [ 0x8A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TXS: [ 0x9A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		TXY: [ 0x9B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TYA: [ 0x98, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		TYX: [ 0xBB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		WAI: [ 0xCB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		WDM: [ 0x42, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// --------
		XBA: [ 0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// N-----Z-
		XCE: [ 0xFB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ],	// -------C (C=E, E=C)
	};

	export class StepLog{
		Instruction: Instruction	= Instruction.BRK;
		Opcode: number | null		= InstructionTable.BRK[Addressing.Stack];
		Operand1: number		= 0;
		Operand2: number		= 0;
		InstructionAddress: number	= 0;
		IndirectAddress: number		= 0;
		EffectiveAddress: number	= 0;
		EffectiveValue: number		= 0;
		CpuCycle: number		= 0;
		ExecuteCycle: number		= 0;
		SourceLineNumber: number	= -1;
		Registers: Registers		= new Registers();

		public GetLogString(): string{
			// TODO: Implements
			return `${Instruction[this.Instruction]}`;
		}

	};

}
//--------------------------------------------------

namespace Assembler{
	export class Assembler{
		public static Assemble(code: string): DataChunk[] | null{
			// TODO: Implements
			if(true){
				// DEBUG
				const token: CodeToken	= {
					Type: CodeTokenType.Define,
					Line: 0,
					Address: 0,
				};
				const log: Emulator.StepLog = new Emulator.StepLog();
				console.log(log.GetLogString());
			}
			return null;
		}
	}

	export type DataChunk = {
		Address: number,
		Data: Uint8Array,
	};
	enum CodeTokenType{
		Invalid,
		DirectiveOrigin,	// ".org"
		DirectiveDataByte,	// ".db"
		DirectiveDataWord,	// ".dw"
		DirectiveDataLong,	// ".dl"
		DirectiveDataDouble,	// ".dd"
		LabelGlobal,		// "Xxx:"
		LabelLocal,		// ".xxx"
		LabelPlus,		// "+"
		LabelMinus,		// "-"
		Instruction,		// "LDA"
		Define,			// "Xxx=YY"
	}
	interface CodeToken{
		Type: CodeTokenType;
		Line: number;
		Address: number;
	}
}

//--------------------------------------------------


