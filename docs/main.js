"use strict";
var Utility;
(function (Utility) {
    class Type {
        static Modulo(v, m) {
            return ((v % m) + m) % m;
        }
        static ToByte(v) {
            return this.Modulo(v, (2 ** 8));
        }
        static ToChar(v) {
            v = this.ToByte(v);
            if (v >= (2 ** 7)) {
                return -(2 ** 8) + v;
            }
            return v;
        }
        static ToWord(v) {
            return this.Modulo(v, (2 ** 16));
        }
        static ToShort(v) {
            v = this.ToWord(v);
            if (v >= (2 ** 15)) {
                return -(2 ** 16) + v;
            }
            return v;
        }
        static ToUint(v) {
            return this.Modulo(v, (2 ** 32));
        }
        static ToInt(v) {
            v = this.ToUint(v);
            if (v >= (2 ** 31)) {
                return -(2 ** 32) + v;
            }
            return v;
        }
        static ToLong(v) {
            return this.Modulo(v, (2 ** 24));
        }
    }
    Utility.Type = Type;
    class Format {
        static SignChar(v) {
            return (v >= 0) ? '+' : '-';
        }
        static ToHexString(v, digit = 2) {
            const s = '0'.repeat(digit) + v.toString(16);
            return s.substring(s.length - digit).toUpperCase();
        }
        static PadSpace(str, length = 0) {
            const l = length - str.length;
            const s = str + ((l > 0) ? ' '.repeat(l) : '');
            return s;
        }
        static PadNumber(v, digit = 0, padZero = false) {
            const p = (padZero) ? '0' : ' ';
            const s = p.repeat(digit) + v.toString();
            return s.substring(s.length - digit);
        }
        static RemoveAfter(str, remove) {
            const i = str.indexOf(remove);
            if (i >= 0) {
                return str.substring(0, i);
            }
            return str;
        }
    }
    Utility.Format = Format;
    class Math {
        static IsRange(v, s, e) {
            return (s <= v) && (v < e);
        }
        static Saturation(v, s, e) {
            if (v < s) {
                return s;
            }
            if (e < v) {
                return e;
            }
            return v;
        }
    }
    Utility.Math = Math;
    class CharacterReadStream {
        constructor(allString, position = 0, LiteralCharacters = ['\"', '\'',]) {
            this.allString = allString;
            this.position = position;
            this.LiteralCharacters = LiteralCharacters;
            this.rawIndex = 0;
            this.readEnd = true;
            this.lastRead = '';
            this.SetPosition(position);
        }
        ResetPosition() {
            this.rawIndex = 0;
            this.position = 0;
            this.readEnd = false;
            this.lastRead = '';
            if (this.allString.length <= 0) {
                this.readEnd = true;
            }
        }
        SetPosition(position) {
            this.ResetPosition();
            for (let i = 0; i < position; i++) {
                this.Read();
            }
        }
        GetPosition() {
            return this.position;
        }
        ReadEnd() {
            return this.readEnd;
        }
        Read() {
            let output = '';
            let enclosingChar = null;
            let isEscaping = false;
            let i;
            if (this.readEnd) {
                return '';
            }
            for (i = this.rawIndex; i < this.allString.length; i++) {
                const c = this.allString[i];
                const isEncloseChar = this.LiteralCharacters.includes(c);
                const isEscapeChar = (c == '\\');
                if (enclosingChar) {
                    if (isEscaping) {
                        isEscaping = false;
                        output += c;
                        continue;
                    }
                    if (isEscapeChar) {
                        isEscaping = true;
                        output += c;
                        continue;
                    }
                    if (c == enclosingChar) {
                        enclosingChar = null;
                        output += c;
                        i++;
                        break;
                    }
                    output += c;
                    continue;
                }
                if (isEncloseChar) {
                    enclosingChar = c;
                    output += c;
                    continue;
                }
                output += c;
                i++;
                break;
            }
            if (enclosingChar) {
                return null;
            }
            this.rawIndex = i;
            this.position++;
            this.readEnd = (i >= this.allString.length);
            this.lastRead = output;
            return output;
        }
        ReadBack() {
            let index = this.position - 1;
            let back = this.lastRead;
            this.ResetPosition();
            for (let i = 0; i < index; i++) {
                this.Read();
            }
            return back;
        }
        Remaining() {
            const clone = new CharacterReadStream(this.allString, this.position, this.LiteralCharacters);
            let output = '';
            while (!clone.ReadEnd()) {
                output += clone.Read();
            }
            return output;
        }
    }
    Utility.CharacterReadStream = CharacterReadStream;
    class StringCompression {
        static Compress(input) {
            const asciiString = StringCompression.EncodeToAscii(input);
            let compressed = [];
            let caret = 0;
            const dictionary = {};
            function updateDictionary() {
                var _a;
                const asciiIndex = caret - StringCompression.DictionaryHashLength + 1;
                let key = asciiString.substring(asciiIndex, asciiIndex + StringCompression.DictionaryHashLength);
                if (key.length < StringCompression.DictionaryHashLength) {
                    return;
                }
                dictionary[key] = (_a = dictionary[key]) !== null && _a !== void 0 ? _a : [];
                dictionary[key].push(caret - StringCompression.DictionaryHashLength + 1);
            }
            function matchLength(reference, referenceStart, search) {
                let i;
                for (i = 0; i < search.length; i++) {
                    const referenceIndex = referenceStart + i;
                    if ((reference.length <= referenceIndex) || (reference[referenceIndex] !== search[i])) {
                        return i;
                    }
                }
                return i;
            }
            while (caret < asciiString.length) {
                const hashKey = asciiString.substring(caret, caret + StringCompression.DictionaryHashLength);
                const hashEntry = dictionary[hashKey];
                if (!hashEntry) {
                    compressed.push(hashKey.charCodeAt(0));
                    updateDictionary();
                    caret++;
                    continue;
                }
                else {
                    const target = asciiString.substring(caret, caret + StringCompression.TargetLength);
                    let mostMatchIndex = hashEntry[hashEntry.length - 1];
                    let mostMatchLength = matchLength(asciiString, hashEntry[hashEntry.length - 1], target);
                    for (let i = hashEntry.length - (StringCompression.DictionaryHashLength - 1); 0 <= i; i--) {
                        const distance = caret - hashEntry[i] - 1;
                        if (distance >= StringCompression.SlideWindowMaxHistory) {
                            break;
                        }
                        let matchedLength = matchLength(asciiString, hashEntry[i], target);
                        if (mostMatchLength < matchedLength) {
                            mostMatchIndex = hashEntry[i];
                            mostMatchLength = matchedLength;
                        }
                    }
                    const distance = caret - mostMatchIndex - 1;
                    if ((distance >= StringCompression.SlideWindowMaxHistory) || (mostMatchLength < StringCompression.CompressLength)) {
                        compressed.push(hashKey.charCodeAt(0));
                        updateDictionary();
                        caret++;
                        continue;
                    }
                    const windowIndex = ((distance << 4) & 0x7FF0);
                    const windowLength = ((mostMatchLength - StringCompression.CompressLength) & 0x000F);
                    const compressWord = 0x8000 | windowIndex | windowLength;
                    compressed.push((compressWord >> 8) & 0xFF);
                    compressed.push((compressWord) & 0xFF);
                    for (let i = 0; i < mostMatchLength; i++) {
                        updateDictionary();
                        caret++;
                    }
                }
            }
            return StringCompression.ArrayToBase64(compressed);
        }
        static Decompress(input) {
            var _a;
            const inputArray = StringCompression.Base64ToArray(input);
            let extracted = '';
            let caret = 0;
            while (caret < inputArray.length) {
                const c = inputArray[caret];
                caret++;
                if (c < 0x80) {
                    extracted += String.fromCharCode(c);
                    continue;
                }
                if (caret >= inputArray.length) {
                    return null;
                }
                const c2 = inputArray[caret];
                caret++;
                const compressWord = (c << 8) | c2;
                const windowIndex = ((compressWord & 0x7FF0) >> 4) + 1;
                const windowLength = (compressWord & 0x000F) + StringCompression.CompressLength;
                const startIndex = extracted.length - windowIndex;
                for (let i = 0; i < windowLength; i++) {
                    extracted += (_a = extracted[startIndex + i]) !== null && _a !== void 0 ? _a : '';
                }
            }
            try {
                return StringCompression.DecodeFromAscii(extracted);
            }
            catch (_b) {
                return null;
            }
        }
        static EncodeToAscii(multiByte) {
            return encodeURIComponent(multiByte);
        }
        static DecodeFromAscii(ascii) {
            return decodeURIComponent(ascii);
        }
        static ArrayToBase64(data) {
            let b64string = btoa(String.fromCharCode(...data));
            return b64string;
        }
        static Base64ToArray(data) {
            let byteArray = [];
            const decoded = atob(data);
            for (let i = 0; i < decoded.length; i++) {
                const c = decoded.charCodeAt(i);
                byteArray.push(c);
            }
            return byteArray;
        }
    }
    StringCompression.DictionaryHashLength = 3;
    StringCompression.CompressLength = 3;
    StringCompression.SlideWindowMaxHistory = 2047;
    StringCompression.TargetLength = 15 + StringCompression.CompressLength;
    Utility.StringCompression = StringCompression;
})(Utility || (Utility = {}));
var Emulator;
(function (Emulator) {
    class Cpu {
        constructor(Memory) {
            this.Memory = Memory;
            this.Registers = new Registers();
            this.MasterCycleCounter = 0;
            this.CpuCycleCounter = 0;
            this.Logs = [];
            this.CpuHalted = false;
            this.CpuSlept = false;
            this.PendingBoot = true;
            this.PendingRst = true;
            this.PendingAbt = false;
            this.PendingNmi = false;
            this.PendingIrq = false;
            this.yieldInterrupt = null;
            this.yieldFunction = null;
            this.ResetRegisters = null;
            this.Reset();
            this.Memory.Cpu = this;
        }
        Boot() {
            this.Registers = new Registers();
            this.PendingBoot = true;
            this.PendingRst = true;
        }
        RST() {
            this.PendingRst = true;
        }
        ABT() {
            this.PendingAbt = true;
        }
        NMI() {
            this.PendingNmi = true;
        }
        IRQ() {
            this.PendingIrq = true;
        }
        ClearAllInterrupts() {
            this.PendingBoot = false;
            this.PendingRst = false;
            this.PendingAbt = false;
            this.PendingNmi = false;
            this.PendingIrq = false;
        }
        Clock() {
            if (this.PendingRst) {
                this.PushResetEvent(this.PendingBoot);
                this.JumpInterruptHandler(InterruptType.EmulationRST);
                this.Reset();
                this.PendingBoot = false;
                this.PendingRst = false;
            }
            if (this.CpuHalted) {
                this.Memory.ClockIO(MinimumMasterCycle);
                return;
            }
            {
                if (this.yieldInterrupt === null) {
                    this.yieldInterrupt = this.ExecuteInterrupt();
                }
                const execute = this.yieldInterrupt.next();
                if (execute.done) {
                    this.yieldInterrupt = null;
                }
                if ((!execute.done) || (execute.value)) {
                    this.UpdateCycle();
                    return;
                }
            }
            if (this.CpuSlept) {
                this.Memory.ClockIO(MinimumMasterCycle);
                return;
            }
            {
                if (this.yieldFunction === null) {
                    this.yieldFunction = this.ExecuteInstruction();
                }
                const execute = this.yieldFunction.next();
                if (execute.done) {
                    this.yieldFunction = null;
                }
                this.UpdateCycle();
            }
        }
        Step() {
            do {
                this.Clock();
            } while (this.yieldFunction !== null);
        }
        IsInstructionCompleted() {
            return this.yieldFunction === null;
        }
        UpdateCycle() {
            const lastLog = this.Logs[this.Logs.length - 1];
            const lastAccess = lastLog.AccessLog[lastLog.AccessLog.length - 1];
            const lastCycle = lastAccess.Cycle;
            this.Memory.ClockIO(lastCycle);
            this.MasterCycleCounter += lastCycle;
        }
        Reset() {
            this.MasterCycleCounter = 0;
            this.CpuCycleCounter = 0;
            this.CpuHalted = false;
            this.CpuSlept = false;
            this.PendingRst = true;
            this.PendingAbt = false;
            this.PendingNmi = false;
            this.PendingIrq = false;
            this.yieldFunction = null;
            this.Registers.SetStatusFlagD(false);
            this.Registers.SetStatusFlagI(true);
            this.Registers.SetStatusFlagE(true);
            if (this.ResetRegisters !== null) {
                this.Registers.SetRegisters(this.ResetRegisters);
            }
        }
        PushResetEvent(boot) {
            const cpu = this;
            const sp = cpu.Registers.S;
            if (boot) {
                cpu.Registers.SetRegisterS(cpu.Registers.S + 3);
            }
            function pushStack(value) {
                value = Utility.Type.ToByte(value);
                const address = cpu.Registers.S;
                const result = cpu.WriteDataByte(AccessType.PushStack, address, value);
                cpu.Registers.SetRegisterS(cpu.Registers.S - 1);
            }
            pushStack(cpu.Registers.PB);
            pushStack(cpu.Registers.PC >> 8);
            pushStack(cpu.Registers.PC);
            pushStack(cpu.Registers.P);
            if (boot) {
                cpu.Registers.SetRegisterS(sp);
            }
            else {
                cpu.Registers.SetRegisterS(sp + 1);
            }
        }
        GetRegisters() {
            return this.Registers.Clone();
        }
        *ExecuteInstruction() {
            const cpu = this;
            const log = new StepLog();
            this.Logs.push(log);
            log.MasterCycle = this.MasterCycleCounter;
            log.CpuCycle = this.CpuCycleCounter;
            log.Registers = this.GetRegisters();
            log.InstructionAddress = this.Registers.GetFullProgramCounter();
            let instructionFunction;
            const startPC = this.Registers.PC;
            const startSP = this.Registers.S;
            let offsetSP = 0;
            const opcode = this.FetchProgramByte(AccessType.FetchOpcode);
            log.Instruction = opcode[0].Data;
            log.Source = opcode[0].Source;
            log.AccessLog.push(opcode[1]);
            this.CpuCycleCounter++;
            yield;
            function calculateInstructionLength() {
                const endPC = cpu.Registers.PC;
                const diffPC = endPC - startPC;
                log.InstructionLength = diffPC;
            }
            function pushDummyAccess(accessType, readAccess = true, writeAccess = false, offset = 0) {
                const address = (cpu.Memory.AddressBus & 0xFF0000) + Utility.Type.ToWord((cpu.Memory.AddressBus & 0x00FFFF) + offset);
                if (readAccess) {
                    const dummyAccess = cpu.ReadDataByte(accessType, address);
                    log.AccessLog.push({
                        AddressBus: address,
                        DataBus: cpu.Memory.DataBus,
                        Region: dummyAccess[1].Region,
                        Type: accessType,
                        Cycle: AccessSpeed.Fast,
                    });
                }
                if (writeAccess) {
                    const dummyAccess = cpu.WriteDataByte(accessType, address, cpu.Memory.DataBus);
                    log.AccessLog.push({
                        AddressBus: address,
                        DataBus: cpu.Memory.DataBus,
                        Region: dummyAccess[1].Region,
                        Type: accessType,
                        Cycle: AccessSpeed.Fast,
                    });
                }
            }
            function pushPushStack(value, emulationWrapping = false) {
                let address = cpu.Registers.S;
                if (regs.GetStatusFlagE() && !emulationWrapping) {
                    address = startSP + offsetSP;
                }
                const result = cpu.WriteDataByte(AccessType.PushStack, address, value);
                value = Utility.Type.ToByte(value);
                cpu.Registers.SetRegisterS(cpu.Registers.S - 1);
                offsetSP--;
                log.AccessLog.push({
                    AddressBus: address,
                    DataBus: value,
                    Region: result[1].Region,
                    Type: result[1].Type,
                    Cycle: result[1].Cycle,
                });
            }
            function pushPullStack(emulationWrapping = false) {
                cpu.Registers.SetRegisterS(cpu.Registers.S + 1);
                offsetSP++;
                let address = cpu.Registers.S;
                if (regs.GetStatusFlagE() && !emulationWrapping) {
                    address = startSP + offsetSP;
                }
                const result = cpu.ReadDataByte(AccessType.PullStack, address);
                const value = result[0].Data;
                log.AccessLog.push({
                    AddressBus: address,
                    DataBus: value,
                    Region: result[1].Region,
                    Type: result[1].Type,
                    Cycle: result[1].Cycle,
                });
                return value;
            }
            function updateNZFlag(lengthFlag, value) {
                value = Utility.Type.ToWord(value);
                const msbMask = (lengthFlag) ? 0x0080 : 0x8000;
                const valueMask = (lengthFlag) ? 0x00FF : 0xFFFF;
                cpu.Registers.SetStatusFlagN((value & msbMask) !== 0);
                cpu.Registers.SetStatusFlagZ((value & valueMask) === 0);
            }
            function* AddressingAbsDbr() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const effectiveAddress = cpu.Registers.ToDataAddress(operand1);
                log.Addressing = Addressing.Absolute;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAbsPbr(waitFlag) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                if (waitFlag) {
                    yield;
                    pushDummyAccess(AccessType.ReadDummy);
                    yield;
                }
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const effectiveAddress = cpu.Registers.ToProgramAddress(operand1);
                log.Addressing = Addressing.AbsoluteJump;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAbsRmw() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const effectiveAddress = cpu.Registers.ToDataAddress(operand1);
                const readDataLow = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
                log.AccessLog.push(readDataLow[1]);
                yield;
                let effectiveValue = readDataLow[0].Data;
                if (!cpu.Registers.GetStatusFlagM()) {
                    const readDataHigh = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
                    log.AccessLog.push(readDataHigh[1]);
                    effectiveValue |= (readDataHigh[0].Data << 8);
                    yield;
                }
                if (!cpu.Registers.GetStatusFlagE()) {
                    pushDummyAccess(AccessType.ReadDummy);
                }
                else {
                    pushDummyAccess(AccessType.WriteDummy, false, true);
                }
                yield;
                log.Addressing = Addressing.Absolute;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                log.EffectiveValue = effectiveValue;
                yield* instructionFunction[1];
            }
            function* AddressingAbsIdxIdrX(pushPC) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                if (pushPC) {
                    const pushValue = cpu.Registers.PC;
                    pushPushStack(pushValue >> 8);
                    yield;
                    pushPushStack(pushValue);
                    yield;
                }
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const indirectAddress = cpu.Registers.ToProgramAddress(operand1 + cpu.Registers.GetRegisterX());
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                const effectiveAddress = cpu.Registers.ToProgramAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
                log.Addressing = Addressing.AbsoluteIndexedIndirect;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAbsIdrJump(lengthFlag) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const indirectAddress = operand1;
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                let effectiveAddress;
                if (!lengthFlag) {
                    yield;
                    const effectiveAddressBank = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 2);
                    log.AccessLog.push(effectiveAddressBank[1]);
                    effectiveAddress = (effectiveAddressBank[0].Data << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
                }
                else {
                    effectiveAddress = cpu.Registers.ToProgramAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
                }
                log.Addressing = (lengthFlag) ? Addressing.AbsoluteIndirect : Addressing.AbsoluteIndirectLong;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAbsLong(waitFlag = true) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                yield;
                const operand1Bank = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Bank[1]);
                calculateInstructionLength();
                if (waitFlag) {
                    yield;
                }
                const operand1 = (operand1Bank[0].Data << 16) | (operand1High[0].Data << 8) | (operand1Low[0].Data);
                log.Addressing = Addressing.AbsoluteLong;
                log.Operand1 = operand1;
                log.EffectiveAddress = operand1;
                yield* instructionFunction[1];
            }
            function* AddressingAbsLongJsl() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                yield;
                pushPushStack(cpu.Registers.PB);
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1Bank = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Bank[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1Bank[0].Data << 16) | (operand1High[0].Data << 8) | (operand1Low[0].Data);
                log.Addressing = Addressing.AbsoluteLong;
                log.Operand1 = operand1;
                log.EffectiveAddress = operand1;
                yield* instructionFunction[1];
            }
            function* AddressingLongIdxX() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                yield;
                const operand1Bank = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Bank[1]);
                calculateInstructionLength();
                yield;
                const effectiveAddressPage = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const operand1 = (operand1Bank[0].Data << 16) | effectiveAddressPage;
                const effectiveAddress = Utility.Type.ToLong(operand1 + cpu.Registers.GetRegisterX());
                log.Addressing = Addressing.AbsoluteLongIndexedX;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAbsIdxX(writeAccess) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const baseAddress = operand1;
                const effectiveAddress = cpu.Registers.ToDataAddress(baseAddress + cpu.Registers.GetRegisterX());
                const dummyAddress = cpu.Registers.ToDataAddress((baseAddress & 0x00FF00) | (effectiveAddress & 0xFF));
                const basePage = baseAddress & 0x00FF00;
                const effectivePage = effectiveAddress & 0x00FF00;
                if ((!cpu.Registers.GetStatusFlagX()) || (writeAccess) || (basePage !== effectivePage)) {
                    if (cpu.Registers.GetStatusFlagE()) {
                        const penaltyDummy = cpu.ReadDataByte(AccessType.Penalty, dummyAddress);
                        penaltyDummy[1].Cycle = AccessSpeed.Fast;
                        log.AccessLog.push(penaltyDummy[1]);
                    }
                    else {
                        pushDummyAccess(AccessType.Penalty);
                    }
                    yield;
                }
                log.Addressing = Addressing.AbsoluteIndexedX;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAbsIdxXRmw() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const baseAddress = operand1;
                const effectiveAddress = cpu.Registers.ToDataAddress(baseAddress + cpu.Registers.GetRegisterX());
                const dummyAddress = cpu.Registers.ToDataAddress((baseAddress & 0x00FF00) | (effectiveAddress & 0xFF));
                const dummyAccess = cpu.ReadDataByte(AccessType.ReadDummy, dummyAddress);
                dummyAccess[1].Cycle = AccessSpeed.Fast;
                log.AccessLog.push(dummyAccess[1]);
                yield;
                const readDataLow = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
                log.AccessLog.push(readDataLow[1]);
                yield;
                let effectiveValue = readDataLow[0].Data;
                if (!cpu.Registers.GetStatusFlagM()) {
                    const readDataHigh = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
                    log.AccessLog.push(readDataHigh[1]);
                    effectiveValue |= (readDataHigh[0].Data << 8);
                    yield;
                }
                if (!cpu.Registers.GetStatusFlagE()) {
                    pushDummyAccess(AccessType.ReadDummy);
                }
                else {
                    pushDummyAccess(AccessType.WriteDummy, false, true);
                }
                yield;
                log.Addressing = Addressing.AbsoluteIndexedY;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                log.EffectiveValue = effectiveValue;
                yield* instructionFunction[1];
            }
            function* AddressingAbsIdxY(writeAccess) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = (operand1High[0].Data << 8) | (operand1Low[0].Data);
                const baseAddress = operand1;
                const effectiveAddress = cpu.Registers.ToDataAddress(baseAddress + cpu.Registers.GetRegisterY());
                const dummyAddress = cpu.Registers.ToDataAddress((baseAddress & 0x00FF00) | (effectiveAddress & 0xFF));
                const basePage = baseAddress & 0x00FF00;
                const effectivePage = effectiveAddress & 0x00FF00;
                if ((!cpu.Registers.GetStatusFlagX()) || (writeAccess) || (basePage !== effectivePage)) {
                    if (cpu.Registers.GetStatusFlagE()) {
                        const penaltyDummy = cpu.ReadDataByte(AccessType.Penalty, dummyAddress);
                        penaltyDummy[1].Cycle = AccessSpeed.Fast;
                        log.AccessLog.push(penaltyDummy[1]);
                    }
                    else {
                        pushDummyAccess(AccessType.Penalty);
                    }
                    yield;
                }
                log.Addressing = Addressing.AbsoluteIndexedY;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingAccumulator() {
                calculateInstructionLength();
                pushDummyAccess(AccessType.ReadDummy, true, false, 1);
                log.Addressing = Addressing.Accumulator;
                yield* instructionFunction[1];
            }
            function* AddressingXyc() {
                const operand1Bank = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Bank[1]);
                yield;
                const operand2Bank = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand2Bank[1]);
                calculateInstructionLength();
                yield;
                const destinationAddress = (operand1Bank[0].Data << 16) | cpu.Registers.GetRegisterY();
                const sourceAddress = (operand2Bank[0].Data << 16) | cpu.Registers.GetRegisterX();
                const effectiveAddress = sourceAddress;
                const readValue = cpu.ReadDataByte(AccessType.Read, sourceAddress);
                log.AccessLog.push(readValue[1]);
                yield;
                const effectiveValue = readValue[0].Data;
                const writeValue = cpu.WriteDataByte(AccessType.Write, destinationAddress, effectiveValue);
                log.AccessLog.push(writeValue[1]);
                yield;
                cpu.Registers.DB = operand1Bank[0].Data;
                log.Addressing = Addressing.BlockMove;
                log.Operand1 = operand1Bank[0].Data;
                log.Operand2 = operand2Bank[0].Data;
                log.EffectiveAddress = effectiveAddress;
                log.EffectiveValue = effectiveValue;
                yield* instructionFunction[1];
            }
            function* AddressingDp() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                const operand1 = operand1Low[0].Data;
                const effectiveAddress = cpu.Registers.ToDirectAddress(operand1);
                log.Addressing = Addressing.Directpage;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpRmw() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                const operand1 = operand1Low[0].Data;
                const effectiveAddress = cpu.Registers.ToDirectAddress(operand1);
                const readDataLow = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
                log.AccessLog.push(readDataLow[1]);
                yield;
                let effectiveValue = readDataLow[0].Data;
                if (!cpu.Registers.GetStatusFlagM()) {
                    const readDataHigh = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
                    log.AccessLog.push(readDataHigh[1]);
                    effectiveValue |= (readDataHigh[0].Data << 8);
                    yield;
                }
                if (!cpu.Registers.GetStatusFlagE()) {
                    pushDummyAccess(AccessType.ReadDummy);
                }
                else {
                    pushDummyAccess(AccessType.WriteDummy, false, true);
                }
                yield;
                log.Addressing = Addressing.Directpage;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                log.EffectiveValue = effectiveValue;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdxIdrX() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1 = operand1Low[0].Data;
                const indirectAddress = cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterX());
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                let indirectAddressHigh = indirectAddress + 1;
                if (regs.GetStatusFlagE()) {
                    indirectAddressHigh = Utility.Type.ToWord((indirectAddress & 0xFF00) | (indirectAddressHigh & 0xFF));
                }
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddressHigh);
                log.AccessLog.push(effectiveAddressHigh[1]);
                const effectiveAddress = cpu.Registers.ToDataAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
                yield;
                log.Addressing = Addressing.DirectpageIndexedIndirectX;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdr() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                const operand1 = operand1Low[0].Data;
                const indirectAddress = cpu.Registers.ToDirectAddress(operand1);
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                const effectiveAddress = cpu.Registers.ToDataAddress((effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data);
                yield;
                log.Addressing = Addressing.DirectpageIndirect;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdrIdxY(writeAccess) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                const operand1 = operand1Low[0].Data;
                const indirectAddress = cpu.Registers.ToDirectAddress(operand1);
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                const indirectBaseAddress = (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
                const effectiveAddress = cpu.Registers.ToDataAddress(indirectBaseAddress + cpu.Registers.GetRegisterY());
                const dummyAddress = cpu.Registers.ToDataAddress((indirectBaseAddress & 0x00FF00) | (effectiveAddress & 0xFF));
                yield;
                const basePage = indirectBaseAddress & 0x00FF00;
                const effectivePage = effectiveAddress & 0x00FF00;
                if ((!cpu.Registers.GetStatusFlagX()) || (writeAccess) || (basePage !== effectivePage)) {
                    if (cpu.Registers.GetStatusFlagE()) {
                        const penaltyDummy = cpu.ReadDataByte(AccessType.Penalty, dummyAddress);
                        penaltyDummy[1].Cycle = AccessSpeed.Fast;
                        log.AccessLog.push(penaltyDummy[1]);
                    }
                    else {
                        pushDummyAccess(AccessType.Penalty);
                    }
                    yield;
                }
                log.Addressing = Addressing.DirectpageIndirectIndexedY;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdrLongIdxY() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                const operand1 = operand1Low[0].Data;
                const indirectAddress = cpu.Registers.ToDirectAddress(operand1);
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                yield;
                const effectiveAddressBank = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 2);
                log.AccessLog.push(effectiveAddressBank[1]);
                const effectiveAddressPage = ((effectiveAddressHigh[0].Data << 8) | (effectiveAddressLow[0].Data)) + cpu.Registers.GetRegisterY();
                const effectiveAddress = Utility.Type.ToLong((effectiveAddressBank[0].Data << 16) | effectiveAddressPage);
                yield;
                log.Addressing = Addressing.DirectpageIndirectLongIndexedY;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdrLong() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                const operand1 = operand1Low[0].Data;
                const indirectAddress = cpu.Registers.ToDirectAddress(operand1);
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                yield;
                const effectiveAddressBank = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 2);
                log.AccessLog.push(effectiveAddressBank[1]);
                const effectiveAddress = (effectiveAddressBank[0].Data << 16) | (effectiveAddressHigh[0].Data << 8) | effectiveAddressLow[0].Data;
                yield;
                log.Addressing = Addressing.DirectpageIndirectLong;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdxX() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1 = operand1Low[0].Data;
                const effectiveAddress = cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterX());
                log.Addressing = Addressing.DirectpageIndexedX;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdxXRmw() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1 = operand1Low[0].Data;
                const effectiveAddress = cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterX());
                const readDataLow = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 0);
                log.AccessLog.push(readDataLow[1]);
                yield;
                let effectiveValue = readDataLow[0].Data;
                if (!cpu.Registers.GetStatusFlagM()) {
                    const readDataHigh = cpu.ReadDataByte(AccessType.Read, effectiveAddress + 1);
                    log.AccessLog.push(readDataHigh[1]);
                    effectiveValue |= (readDataHigh[0].Data << 8);
                    yield;
                }
                if (!cpu.Registers.GetStatusFlagE()) {
                    pushDummyAccess(AccessType.ReadDummy);
                }
                else {
                    pushDummyAccess(AccessType.WriteDummy, false, true);
                }
                yield;
                log.Addressing = Addressing.DirectpageIndexedX;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                log.EffectiveValue = effectiveValue;
                yield* instructionFunction[1];
            }
            function* AddressingDpIdxY() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.IsZeroDRegisterLow()) {
                    pushDummyAccess(AccessType.Penalty);
                    yield;
                }
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1 = operand1Low[0].Data;
                const effectiveAddress = cpu.Registers.ToDirectAddress(operand1 + cpu.Registers.GetRegisterY());
                log.Addressing = Addressing.DirectpageIndexedY;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingImmediate(addressing, lengthFlag) {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                let operand1 = operand1Low[0].Data;
                if (!lengthFlag) {
                    yield;
                    const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                    operand1 |= (operand1High[0].Data << 8);
                    log.AccessLog.push(operand1High[1]);
                }
                calculateInstructionLength();
                log.Addressing = addressing;
                log.Operand1 = operand1;
                log.EffectiveValue = operand1;
                yield* instructionFunction[1];
            }
            function* AddressingImmediateImm8() {
                yield* AddressingImmediate(Addressing.Immediate8, true);
            }
            function* AddressingImmediateMemory() {
                yield* AddressingImmediate(Addressing.ImmediateMemory, cpu.Registers.GetStatusFlagM());
            }
            function* AddressingImmediateIndex() {
                yield* AddressingImmediate(Addressing.ImmediateIndex, cpu.Registers.GetStatusFlagX());
            }
            function* AddressingImplied(additionalWait = false) {
                calculateInstructionLength();
                pushDummyAccess(AccessType.ReadDummy, true, false, 1);
                if (additionalWait) {
                    yield;
                    pushDummyAccess(AccessType.ReadDummy);
                }
                log.Addressing = Addressing.Implied;
                yield* instructionFunction[1];
            }
            function* AddressingRel() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                const operand1 = Utility.Type.ToChar(operand1Low[0].Data);
                const effectiveAddress = cpu.Registers.ToRelativeAddress(operand1);
                log.Addressing = Addressing.Relative;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingRelLong() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                yield;
                const operand1High = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1High[1]);
                calculateInstructionLength();
                yield;
                const operand1 = Utility.Type.ToShort((operand1High[0].Data << 8) | (operand1Low[0].Data));
                const effectiveAddress = cpu.Registers.ToRelativeAddress(operand1);
                log.Addressing = Addressing.RelativeLong;
                log.Operand1 = operand1;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingStackPull(lengthFlag, emulationWrapping = true) {
                calculateInstructionLength();
                pushDummyAccess(AccessType.ReadDummy, true, false, 1);
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const stackPointer = cpu.Registers.S;
                const stackLow = pushPullStack(emulationWrapping);
                let effectiveValue = stackLow;
                if (!lengthFlag) {
                    yield;
                    const stackHigh = pushPullStack(emulationWrapping);
                    effectiveValue |= (stackHigh << 8);
                }
                updateNZFlag(lengthFlag, effectiveValue);
                log.Addressing = Addressing.Stack;
                log.EffectiveAddress = stackPointer;
                log.EffectiveValue = effectiveValue;
                yield* instructionFunction[1];
            }
            function* AddressingStackPush(value, lengthFlag) {
                const stackPointer = cpu.Registers.S;
                pushDummyAccess(AccessType.ReadDummy, true, false, 1);
                yield;
                if (!lengthFlag) {
                    pushPushStack(value >> 8);
                    yield;
                }
                pushPushStack(value);
                log.Addressing = Addressing.Stack;
                log.EffectiveAddress = stackPointer;
                log.EffectiveValue = value;
                yield* instructionFunction[1];
            }
            function* AddressingStackReturnInterrupt() {
                const emulationWrapping = true;
                calculateInstructionLength();
                pushDummyAccess(AccessType.ReadDummy, true, false, 1);
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const stackStatus = pushPullStack(emulationWrapping);
                yield;
                const stackPCLow = pushPullStack(emulationWrapping);
                yield;
                const stackPCHigh = pushPullStack(emulationWrapping);
                let stackPCBank = cpu.Registers.PB;
                if (!cpu.Registers.GetStatusFlagE()) {
                    yield;
                    stackPCBank = pushPullStack(emulationWrapping);
                }
                cpu.Registers.SetRegisterP(stackStatus);
                let effectiveAddress = (stackPCBank << 16) | (stackPCHigh << 8) | stackPCLow;
                log.Addressing = Addressing.Stack;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingStackReturn(lengthFlag) {
                const emulationWrapping = lengthFlag;
                calculateInstructionLength();
                pushDummyAccess(AccessType.ReadDummy, true, false, 1);
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const stackPCLow = pushPullStack(emulationWrapping);
                yield;
                const stackPCHigh = pushPullStack(emulationWrapping);
                yield;
                let stackPCBank = cpu.Registers.PB;
                if (lengthFlag) {
                    pushDummyAccess(AccessType.ReadDummy);
                }
                else {
                    stackPCBank = pushPullStack(emulationWrapping);
                }
                let effectiveAddress = (stackPCBank << 16) | (stackPCHigh << 8) | stackPCLow;
                log.Addressing = Addressing.Stack;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingStackInterrupt(emulationMask) {
                const emulationWrapping = true;
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                if (!cpu.Registers.GetStatusFlagE()) {
                    pushPushStack(cpu.Registers.PB, emulationWrapping);
                    yield;
                }
                const stackPointer = cpu.Registers.S;
                pushPushStack(cpu.Registers.PC >> 8, emulationWrapping);
                yield;
                pushPushStack(cpu.Registers.PC, emulationWrapping);
                yield;
                let statusRegister = cpu.Registers.P;
                if (cpu.Registers.GetStatusFlagE()) {
                    statusRegister |= emulationMask;
                }
                pushPushStack(statusRegister, emulationWrapping);
                yield;
                log.Addressing = Addressing.Immediate8;
                log.Operand1 = operand1Low[0].Data;
                log.EffectiveAddress = stackPointer;
                log.EffectiveValue = operand1Low[0].Data;
                yield* instructionFunction[1];
            }
            function* AddressingStackRel() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const effectiveAddress = cpu.Registers.S + operand1Low[0].Data;
                log.Addressing = Addressing.StackRelative;
                log.Operand1 = operand1Low[0].Data;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* AddressingStackRelIdrIdxY() {
                const operand1Low = cpu.FetchProgramByte(AccessType.FetchOperand);
                log.AccessLog.push(operand1Low[1]);
                calculateInstructionLength();
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const operand1 = operand1Low[0].Data;
                const indirectAddress = cpu.Registers.S + operand1;
                const effectiveAddressLow = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 0);
                log.AccessLog.push(effectiveAddressLow[1]);
                yield;
                const effectiveAddressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, indirectAddress + 1);
                log.AccessLog.push(effectiveAddressHigh[1]);
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                const effectiveAddressPage = ((effectiveAddressHigh[0].Data << 8) | (effectiveAddressLow[0].Data)) + cpu.Registers.GetRegisterY();
                const effectiveAddress = cpu.Registers.ToDataAddress(effectiveAddressPage);
                log.Addressing = Addressing.StackRelativeIndirectIndexedY;
                log.Operand1 = operand1;
                log.IndirectAddress = indirectAddress;
                log.EffectiveAddress = effectiveAddress;
                yield* instructionFunction[1];
            }
            function* InstructionDummy(instruction) {
                log.Instruction = instruction;
            }
            function* InstructionBlockMove(instruction, direction) {
                log.Instruction = instruction;
                const revertAddress = log.InstructionAddress;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                cpu.Registers.SetRegisterX(cpu.Registers.GetRegisterX() + direction);
                cpu.Registers.SetRegisterY(cpu.Registers.GetRegisterY() + direction);
                const length = cpu.Registers.GetRegisterA(true) - 1;
                if (length >= 0) {
                    cpu.Registers.SetProgramCounter(revertAddress);
                }
                cpu.Registers.SetRegisterA(length, true);
            }
            function* InstructionBranch(instruction, branch) {
                log.Instruction = instruction;
                if (!branch) {
                    log.EffectiveValue = cpu.Registers.GetFullProgramCounter();
                    return;
                }
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                const destinationAddress = log.EffectiveAddress;
                if (cpu.Registers.GetStatusFlagE()) {
                    const beforePage = cpu.Registers.GetFullProgramCounter() & 0x00FF00;
                    const destinationPage = destinationAddress & 0x00FF00;
                    if (beforePage !== destinationPage) {
                        yield;
                        pushDummyAccess(AccessType.Penalty);
                    }
                }
                cpu.Registers.SetFullProgramCounter(destinationAddress);
                log.EffectiveValue = destinationAddress;
            }
            function* InstructionCompare(instruction, imm, operand1, lengthFlag) {
                log.Instruction = instruction;
                let readValue = 0;
                if (imm) {
                    readValue = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    readValue = readValueLow[0].Data;
                    if (!lengthFlag) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        readValue |= (readValueHigh[0].Data << 8);
                    }
                }
                let result = operand1 - readValue;
                const cFlag = result >= 0;
                cpu.Registers.SetStatusFlagC(cFlag);
                updateNZFlag(lengthFlag, result);
                log.EffectiveValue = readValue;
            }
            function* InstructionClearFlag(instruction, mask) {
                log.Instruction = instruction;
                const andMask = Utility.Type.ToByte(~mask);
                const effectiveValue = cpu.Registers.P & andMask;
                cpu.Registers.SetRegisterP(effectiveValue);
            }
            function* InstructionInterrupt(nativeInterrupt, emulationInterrupt) {
                const fetchVector = (cpu.Registers.E) ? emulationInterrupt : nativeInterrupt;
                const addressLow = cpu.ReadDataByte(AccessType.ReadIndirect, fetchVector + 0);
                log.AccessLog.push(addressLow[1]);
                yield;
                const addressHigh = cpu.ReadDataByte(AccessType.ReadIndirect, fetchVector + 1);
                log.AccessLog.push(addressHigh[1]);
                const address = (addressHigh[0].Data << 8) | (addressLow[0].Data);
                cpu.Registers.SetFullProgramCounter(address);
                cpu.Registers.SetStatusFlagD(false);
                cpu.Registers.SetStatusFlagI(true);
                log.IndirectAddress = fetchVector;
            }
            function* InstructionJump(instruction, offset) {
                log.Instruction = instruction;
                const destinationBank = log.EffectiveAddress & 0xFF0000;
                const destinationPage = Utility.Type.ToWord((log.EffectiveAddress & 0x00FFFF) + offset);
                const destinationAddress = destinationBank | destinationPage;
                cpu.Registers.SetFullProgramCounter(destinationAddress);
                log.EffectiveValue = destinationAddress;
            }
            function* InstructionLoad(instruction, imm, lengthFlag, destination) {
                log.Instruction = instruction;
                let readValue = 0;
                if (imm) {
                    readValue = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    readValue = readValueLow[0].Data;
                    if (!lengthFlag) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        readValue |= (readValueHigh[0].Data << 8);
                    }
                }
                updateNZFlag(lengthFlag, readValue);
                cpu.Registers.SetRegisters({ [destination]: readValue });
                log.EffectiveValue = readValue;
            }
            function* InstructionPushValue(value, lengthFlag) {
                if (!lengthFlag) {
                    pushPushStack(value >> 8);
                    yield;
                }
                pushPushStack(value);
            }
            function* InstructionSetFlag(instruction, mask) {
                log.Instruction = instruction;
                const effectiveValue = cpu.Registers.P | Utility.Type.ToByte(mask);
                cpu.Registers.SetRegisterP(effectiveValue);
            }
            function* InstructionSetRegister(instruction, destination) {
                log.Instruction = instruction;
                cpu.Registers.SetRegisters({ [destination]: log.EffectiveValue });
            }
            function* InstructionStore(value, lengthFlag) {
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 0, value);
                log.AccessLog.push(writeValueLow[1]);
                if (!lengthFlag) {
                    yield;
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 1, value >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                }
                log.EffectiveValue = value;
            }
            function* InstructionTxx(instruction, sourceValue, destination, lengthFlag) {
                log.Instruction = instruction;
                cpu.Registers.SetRegisters({ [destination]: sourceValue });
                if (lengthFlag !== null) {
                    updateNZFlag(lengthFlag, sourceValue);
                }
            }
            function* InstructionADC(imm = false) {
                const operand1 = cpu.Registers.GetRegisterA();
                let operand2 = 0;
                if (imm) {
                    operand2 = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    operand2 = readValueLow[0].Data;
                    if (!cpu.Registers.GetStatusFlagM()) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        operand2 |= (readValueHigh[0].Data << 8);
                    }
                }
                const valueMask = cpu.Registers.GetMaskM();
                const msbMask = cpu.Registers.GetMsbMaskM();
                const intCarry = (cpu.Registers.GetStatusFlagC()) ? 1 : 0;
                let writeValue = 0;
                let overflowResult = 0;
                if (!cpu.Registers.GetStatusFlagD()) {
                    writeValue = operand1 + operand2 + intCarry;
                    overflowResult = writeValue;
                }
                else {
                    let stepDigitMask = 0x000F;
                    let stepResultMask = 0x000F;
                    let stepCarry = 0x000A;
                    let stepAdd = 0x0006;
                    let carry = intCarry;
                    while (stepDigitMask < valueMask) {
                        let stepResult = (operand1 & stepDigitMask) + (operand2 & stepDigitMask) + carry;
                        overflowResult = stepResult;
                        if (stepResult >= stepCarry) {
                            stepResult += stepAdd;
                        }
                        if (stepResult >= stepResultMask) {
                            carry = stepResultMask + 1;
                        }
                        else {
                            carry = 0;
                        }
                        writeValue |= (stepResult & stepDigitMask);
                        stepDigitMask <<= 4;
                        stepResultMask = (stepResultMask << 4) | 0x000F;
                        stepCarry <<= 4;
                        stepAdd <<= 4;
                    }
                    writeValue |= carry;
                }
                const cFlag = writeValue > valueMask;
                cpu.Registers.SetStatusFlagC(cFlag);
                const signOperand1 = (operand1 & msbMask);
                const signOperand2 = (operand2 & msbMask);
                const signResult = (overflowResult & msbMask);
                const vFlag = (signOperand1 === signOperand2) && (signOperand1 !== signResult);
                cpu.Registers.SetStatusFlagV(vFlag);
                cpu.Registers.SetRegisterA(writeValue);
                updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);
                log.Instruction = Instruction.ADC;
                log.EffectiveValue = operand2;
            }
            function* InstructionAND(imm = false) {
                let effectiveValue = cpu.Registers.GetRegisterA();
                let readValue = 0;
                if (imm) {
                    readValue = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    readValue = readValueLow[0].Data;
                    if (!cpu.Registers.GetStatusFlagM()) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        readValue |= (readValueHigh[0].Data << 8);
                    }
                }
                effectiveValue &= readValue;
                cpu.Registers.SetRegisterA(effectiveValue);
                updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
                log.Instruction = Instruction.AND;
                log.EffectiveValue = readValue;
            }
            function* InstructionASLRegister(instruction, carry) {
                const effectiveValue = cpu.Registers.GetRegisterA();
                const intCarry = (carry) ? 1 : 0;
                let writeValue = ((effectiveValue << 1) | intCarry) & cpu.Registers.GetMaskM();
                cpu.Registers.SetStatusFlagN((writeValue & cpu.Registers.GetMsbMaskM()) !== 0);
                cpu.Registers.SetStatusFlagZ((writeValue) === 0);
                cpu.Registers.SetStatusFlagC((effectiveValue & cpu.Registers.GetMsbMaskM()) !== 0);
                cpu.Registers.SetRegisterA(writeValue);
                log.Instruction = instruction;
            }
            function* InstructionASLMemory(instruction, carry) {
                const effectiveAddress = log.EffectiveAddress;
                const effectiveValue = log.EffectiveValue;
                const intCarry = (carry) ? 1 : 0;
                let writeValue = ((effectiveValue << 1) | intCarry) & cpu.Registers.GetMaskM();
                cpu.Registers.SetStatusFlagN((writeValue & cpu.Registers.GetMsbMaskM()) !== 0);
                cpu.Registers.SetStatusFlagZ((writeValue) === 0);
                cpu.Registers.SetStatusFlagC((effectiveValue & cpu.Registers.GetMsbMaskM()) !== 0);
                if (!cpu.Registers.GetStatusFlagM()) {
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                    yield;
                }
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
                log.AccessLog.push(writeValueLow[1]);
                log.Instruction = instruction;
            }
            function* InstructionBIT(imm = false) {
                let readValue = 0;
                if (imm) {
                    readValue = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    readValue = readValueLow[0].Data;
                    if (!cpu.Registers.GetStatusFlagM()) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        readValue |= (readValueHigh[0].Data << 8);
                    }
                }
                const result = readValue & cpu.Registers.GetRegisterA();
                if (!imm) {
                    const nMask = cpu.Registers.GetMsbMaskM();
                    const vMask = nMask >> 1;
                    cpu.Registers.SetStatusFlagN((readValue & nMask) !== 0);
                    cpu.Registers.SetStatusFlagV((readValue & vMask) !== 0);
                }
                cpu.Registers.SetStatusFlagZ(result === 0);
                log.Instruction = Instruction.BIT;
                log.EffectiveValue = readValue;
            }
            function* InstructionBRK() {
                log.Instruction = Instruction.BRK;
                yield* InstructionInterrupt(InterruptType.NativeBRK, InterruptType.EmulationIRQ);
            }
            function* InstructionBRL() {
                pushDummyAccess(AccessType.ReadDummy);
                const destinationAddress = log.EffectiveAddress;
                cpu.Registers.SetFullProgramCounter(destinationAddress);
                log.Instruction = Instruction.BRL;
                log.EffectiveValue = destinationAddress;
            }
            function* InstructionCMP(imm = false) {
                const operand1 = cpu.Registers.GetRegisterA();
                yield* InstructionCompare(Instruction.CMP, imm, operand1, cpu.Registers.GetStatusFlagM());
            }
            function* InstructionCPX(imm = false) {
                const operand1 = cpu.Registers.GetRegisterX();
                yield* InstructionCompare(Instruction.CPX, imm, operand1, cpu.Registers.GetStatusFlagX());
            }
            function* InstructionCPY(imm = false) {
                const operand1 = cpu.Registers.GetRegisterY();
                yield* InstructionCompare(Instruction.CPY, imm, operand1, cpu.Registers.GetStatusFlagX());
            }
            function* InstructionCOP() {
                log.Instruction = Instruction.COP;
                yield* InstructionInterrupt(InterruptType.NativeCOP, InterruptType.EmulationCOP);
            }
            function* InstructionDECRegister() {
                const effectiveValue = cpu.Registers.GetRegisterA() - 1;
                updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
                cpu.Registers.SetRegisterA(effectiveValue);
                log.Instruction = Instruction.DEC;
            }
            function* InstructionDECMemory() {
                const effectiveAddress = log.EffectiveAddress;
                const effectiveValue = log.EffectiveValue;
                let writeValue = (effectiveValue - 1) & cpu.Registers.GetMaskM();
                updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);
                if (!cpu.Registers.GetStatusFlagM()) {
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                    yield;
                }
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
                log.AccessLog.push(writeValueLow[1]);
                log.Instruction = Instruction.DEC;
            }
            function* InstructionDEX() {
                const effectiveValue = cpu.Registers.GetRegisterX() - 1;
                updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
                cpu.Registers.SetRegisterX(effectiveValue);
                log.Instruction = Instruction.DEX;
            }
            function* InstructionDEY() {
                const effectiveValue = cpu.Registers.GetRegisterY() - 1;
                updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
                cpu.Registers.SetRegisterY(effectiveValue);
                log.Instruction = Instruction.DEY;
            }
            function* InstructionEOR(imm = false) {
                let effectiveValue = cpu.Registers.GetRegisterA();
                let readValue = 0;
                if (imm) {
                    readValue = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    readValue = readValueLow[0].Data;
                    if (!cpu.Registers.GetStatusFlagM()) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        readValue |= (readValueHigh[0].Data << 8);
                    }
                }
                effectiveValue ^= readValue;
                cpu.Registers.SetRegisterA(effectiveValue);
                updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
                log.Instruction = Instruction.EOR;
                log.EffectiveValue = readValue;
            }
            function* InstructionINCRegister() {
                const effectiveValue = cpu.Registers.GetRegisterA() + 1;
                updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
                cpu.Registers.SetRegisterA(effectiveValue);
                log.Instruction = Instruction.INC;
            }
            function* InstructionINCMemory() {
                const effectiveAddress = log.EffectiveAddress;
                const effectiveValue = log.EffectiveValue;
                let writeValue = (effectiveValue + 1) & cpu.Registers.GetMaskM();
                updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);
                if (!cpu.Registers.GetStatusFlagM()) {
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                    yield;
                }
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
                log.AccessLog.push(writeValueLow[1]);
                log.Instruction = Instruction.INC;
            }
            function* InstructionINX() {
                const effectiveValue = cpu.Registers.GetRegisterX() + 1;
                updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
                cpu.Registers.SetRegisterX(effectiveValue);
                log.Instruction = Instruction.INX;
            }
            function* InstructionINY() {
                const effectiveValue = cpu.Registers.GetRegisterY() + 1;
                updateNZFlag(cpu.Registers.GetStatusFlagX(), effectiveValue);
                cpu.Registers.SetRegisterY(effectiveValue);
                log.Instruction = Instruction.INY;
            }
            function* InstructionJSR(instruction, fullAddress) {
                const emulationWrapping = true && !fullAddress;
                const jumpAddress = log.Operand1;
                const pushValue = cpu.Registers.PC - 1;
                pushPushStack(pushValue >> 8, emulationWrapping);
                yield;
                pushPushStack(pushValue, emulationWrapping);
                if (fullAddress) {
                    cpu.Registers.SetFullProgramCounter(jumpAddress);
                }
                else {
                    cpu.Registers.SetProgramCounter(jumpAddress);
                }
                log.Instruction = instruction;
            }
            function* InstructionLDA(imm = false) {
                yield* InstructionLoad(Instruction.LDA, imm, cpu.Registers.GetStatusFlagM(), 'A');
            }
            function* InstructionLDX(imm = false) {
                yield* InstructionLoad(Instruction.LDX, imm, cpu.Registers.GetStatusFlagX(), 'X');
            }
            function* InstructionLDY(imm = false) {
                yield* InstructionLoad(Instruction.LDY, imm, cpu.Registers.GetStatusFlagX(), 'Y');
            }
            function* InstructionLSRRegister(instruction, carry) {
                const effectiveValue = cpu.Registers.GetRegisterA();
                const intCarry = (carry) ? cpu.Registers.GetMsbMaskM() : 0;
                let writeValue = ((effectiveValue >> 1) | intCarry) & cpu.Registers.GetMaskM();
                cpu.Registers.SetStatusFlagN((writeValue & cpu.Registers.GetMsbMaskM()) !== 0);
                cpu.Registers.SetStatusFlagZ((writeValue) === 0);
                cpu.Registers.SetStatusFlagC((effectiveValue & 1) !== 0);
                cpu.Registers.SetRegisterA(writeValue);
                log.Instruction = instruction;
            }
            function* InstructionLSRMemory(instruction, carry) {
                const effectiveAddress = log.EffectiveAddress;
                const effectiveValue = log.EffectiveValue;
                const intCarry = (carry) ? cpu.Registers.GetMsbMaskM() : 0;
                let writeValue = ((effectiveValue >> 1) | intCarry) & cpu.Registers.GetMaskM();
                cpu.Registers.SetStatusFlagN((writeValue & cpu.Registers.GetMsbMaskM()) !== 0);
                cpu.Registers.SetStatusFlagZ((writeValue) === 0);
                cpu.Registers.SetStatusFlagC((effectiveValue & 1) !== 0);
                if (!cpu.Registers.GetStatusFlagM()) {
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                    yield;
                }
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
                log.AccessLog.push(writeValueLow[1]);
                log.Instruction = instruction;
            }
            function* InstructionORA(imm = false) {
                let effectiveValue = cpu.Registers.GetRegisterA();
                let readValue = 0;
                if (imm) {
                    readValue = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    readValue = readValueLow[0].Data;
                    if (!cpu.Registers.GetStatusFlagM()) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        readValue |= (readValueHigh[0].Data << 8);
                    }
                }
                effectiveValue |= readValue;
                cpu.Registers.SetRegisterA(effectiveValue);
                updateNZFlag(cpu.Registers.GetStatusFlagM(), effectiveValue);
                log.Instruction = Instruction.ORA;
                log.EffectiveValue = readValue;
            }
            function* InstructionPEA() {
                log.Instruction = Instruction.PEA;
                log.EffectiveValue = log.Operand1;
                yield* InstructionPushValue(log.Operand1, false);
            }
            function* InstructionPEI() {
                log.Instruction = Instruction.PEI;
                log.EffectiveValue = log.EffectiveAddress;
                yield* InstructionPushValue(log.EffectiveAddress, false);
            }
            function* InstructionPER() {
                log.Instruction = Instruction.PER;
                log.EffectiveValue = log.EffectiveAddress;
                pushDummyAccess(AccessType.ReadDummy);
                yield;
                yield* InstructionPushValue(log.EffectiveAddress, false);
            }
            function* InstructionREP() {
                log.Instruction = Instruction.REP;
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                const writeValue = cpu.Registers.P & Utility.Type.ToByte(~log.Operand1);
                cpu.Registers.SetRegisterP(writeValue);
            }
            function* InstructionSBC(imm = false) {
                const operand1 = cpu.Registers.GetRegisterA();
                let operand2 = 0;
                if (imm) {
                    operand2 = log.Operand1;
                }
                else {
                    const readValueLow = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 0);
                    log.AccessLog.push(readValueLow[1]);
                    operand2 = readValueLow[0].Data;
                    if (!cpu.Registers.GetStatusFlagM()) {
                        yield;
                        const readValueHigh = cpu.ReadDataByte(AccessType.Read, log.EffectiveAddress + 1);
                        log.AccessLog.push(readValueHigh[1]);
                        operand2 |= (readValueHigh[0].Data << 8);
                    }
                }
                const valueMask = cpu.Registers.GetMaskM();
                const msbMask = cpu.Registers.GetMsbMaskM();
                const intCarry = (cpu.Registers.GetStatusFlagC()) ? 1 : 0;
                let writeValue = 0;
                let overflowResult = 0;
                operand2 ^= valueMask;
                if (!cpu.Registers.GetStatusFlagD()) {
                    writeValue = operand1 + operand2 + intCarry;
                    overflowResult = writeValue;
                }
                else {
                    let stepDigitMask = 0x000F;
                    let stepResultMask = 0x000F;
                    let stepCarry = 0x0010;
                    let stepAdd = 0x0006;
                    let carry = intCarry;
                    while (stepDigitMask < valueMask) {
                        let stepResult = (operand1 & stepDigitMask) + (operand2 & stepDigitMask) + carry;
                        overflowResult = stepResult;
                        if (stepResult < stepCarry) {
                            stepResult -= stepAdd;
                        }
                        if (stepResult >= stepResultMask) {
                            carry = stepResultMask + 1;
                        }
                        else {
                            carry = 0;
                        }
                        writeValue |= (stepResult & stepDigitMask);
                        stepDigitMask <<= 4;
                        stepResultMask = (stepResultMask << 4) | 0x000F;
                        stepCarry <<= 4;
                        stepAdd <<= 4;
                    }
                    writeValue |= carry;
                }
                const cFlag = writeValue > valueMask;
                cpu.Registers.SetStatusFlagC(cFlag);
                const signOperand1 = (operand1 & msbMask);
                const signOperand2 = (operand2 & msbMask);
                const signResult = (overflowResult & msbMask);
                const vFlag = (signOperand1 === signOperand2) && (signOperand1 !== signResult);
                cpu.Registers.SetStatusFlagV(vFlag);
                cpu.Registers.SetRegisterA(writeValue);
                updateNZFlag(cpu.Registers.GetStatusFlagM(), writeValue);
                log.Instruction = Instruction.SBC;
                log.EffectiveValue = operand2;
            }
            function* InstructionSEP() {
                log.Instruction = Instruction.SEP;
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                const writeValue = cpu.Registers.P | log.Operand1;
                cpu.Registers.SetRegisterP(writeValue);
            }
            function* InstructionSTA() {
                log.Instruction = Instruction.STA;
                yield* InstructionStore(cpu.Registers.GetRegisterA(), cpu.Registers.GetStatusFlagM());
            }
            function* InstructionSTP() {
                log.Instruction = Instruction.STP;
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                cpu.CpuHalted = true;
            }
            function* InstructionSTX() {
                log.Instruction = Instruction.STX;
                yield* InstructionStore(cpu.Registers.GetRegisterX(), cpu.Registers.GetStatusFlagX());
            }
            function* InstructionSTY() {
                log.Instruction = Instruction.STY;
                yield* InstructionStore(cpu.Registers.GetRegisterY(), cpu.Registers.GetStatusFlagX());
            }
            function* InstructionSTZ() {
                let effectiveValue = cpu.Registers.GetRegisterA();
                let readValue = 0;
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 0, 0);
                log.AccessLog.push(writeValueLow[1]);
                if (!cpu.Registers.GetStatusFlagM()) {
                    yield;
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, log.EffectiveAddress + 1, 0);
                    log.AccessLog.push(writeValueHigh[1]);
                }
                log.Instruction = Instruction.STZ;
                log.EffectiveValue = 0;
            }
            function* InstructionTRB() {
                const effectiveAddress = log.EffectiveAddress;
                const effectiveValue = log.EffectiveValue;
                let writeValue = cpu.Registers.GetRegisterA();
                cpu.Registers.SetStatusFlagZ((writeValue & effectiveValue) === 0);
                writeValue = effectiveValue & Utility.Type.ToWord(~writeValue);
                if (!cpu.Registers.GetStatusFlagM()) {
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                    yield;
                }
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
                log.AccessLog.push(writeValueLow[1]);
                log.Instruction = Instruction.TRB;
            }
            function* InstructionTSB() {
                const effectiveAddress = log.EffectiveAddress;
                const effectiveValue = log.EffectiveValue;
                let writeValue = cpu.Registers.GetRegisterA();
                cpu.Registers.SetStatusFlagZ((writeValue & effectiveValue) === 0);
                writeValue |= effectiveValue;
                if (!cpu.Registers.GetStatusFlagM()) {
                    const writeValueHigh = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 1, writeValue >> 8);
                    log.AccessLog.push(writeValueHigh[1]);
                    yield;
                }
                const writeValueLow = cpu.WriteDataByte(AccessType.Write, effectiveAddress + 0, writeValue);
                log.AccessLog.push(writeValueLow[1]);
                log.Instruction = Instruction.TSB;
            }
            function* InstructionWAI() {
                log.Instruction = Instruction.WAI;
                yield;
                pushDummyAccess(AccessType.ReadDummy);
                cpu.CpuSlept = true;
            }
            function* InstructionXBA() {
                const effectiveValue = cpu.Registers.GetRegisterA(true);
                const writeValue = Utility.Type.ToWord(((effectiveValue >> 8) & 0x00FF) | ((effectiveValue << 8) & 0xFF00));
                updateNZFlag(true, writeValue);
                cpu.Registers.SetRegisterA(writeValue, true);
                log.Instruction = Instruction.XBA;
                log.EffectiveValue = effectiveValue;
            }
            function* InstructionXCE() {
                cpu.Registers.SwapStatusFlagCE();
                log.Instruction = Instruction.XCE;
            }
            const regs = cpu.Registers;
            const flagM = cpu.Registers.GetStatusFlagM();
            const flagX = cpu.Registers.GetStatusFlagX();
            const InstructionTable = [
                [AddressingStackInterrupt(0x30), InstructionBRK()],
                [AddressingDpIdxIdrX(), InstructionORA()],
                [AddressingStackInterrupt(0x20), InstructionCOP()],
                [AddressingStackRel(), InstructionORA()],
                [AddressingDpRmw(), InstructionTSB()],
                [AddressingDp(), InstructionORA()],
                [AddressingDpRmw(), InstructionASLMemory(Instruction.ASL, false)],
                [AddressingDpIdrLong(), InstructionORA()],
                [AddressingStackPush(regs.P, true), InstructionDummy(Instruction.PHP)],
                [AddressingImmediateMemory(), InstructionORA(true)],
                [AddressingAccumulator(), InstructionASLRegister(Instruction.ASL, false)],
                [AddressingStackPush(regs.D, false), InstructionDummy(Instruction.PHD)],
                [AddressingAbsRmw(), InstructionTSB()],
                [AddressingAbsDbr(), InstructionORA()],
                [AddressingAbsRmw(), InstructionASLMemory(Instruction.ASL, false)],
                [AddressingAbsLong(), InstructionORA()],
                [AddressingRel(), InstructionBranch(Instruction.BPL, !regs.GetStatusFlagN())],
                [AddressingDpIdrIdxY(false), InstructionORA()],
                [AddressingDpIdr(), InstructionORA()],
                [AddressingStackRelIdrIdxY(), InstructionORA()],
                [AddressingDpRmw(), InstructionTRB()],
                [AddressingDpIdxX(), InstructionORA()],
                [AddressingDpIdxXRmw(), InstructionASLMemory(Instruction.ASL, false)],
                [AddressingDpIdrLongIdxY(), InstructionORA()],
                [AddressingImplied(), InstructionClearFlag(Instruction.CLC, 0x01)],
                [AddressingAbsIdxY(false), InstructionORA()],
                [AddressingAccumulator(), InstructionINCRegister()],
                [AddressingImplied(), InstructionTxx(Instruction.TCS, regs.GetRegisterA(true), 'S', null)],
                [AddressingAbsRmw(), InstructionTRB()],
                [AddressingAbsIdxX(false), InstructionORA()],
                [AddressingAbsIdxXRmw(), InstructionASLMemory(Instruction.ASL, false)],
                [AddressingLongIdxX(), InstructionORA()],
                [AddressingAbsPbr(true), InstructionJSR(Instruction.JSR, false)],
                [AddressingDpIdxIdrX(), InstructionAND()],
                [AddressingAbsLongJsl(), InstructionJSR(Instruction.JSL, true)],
                [AddressingStackRel(), InstructionAND()],
                [AddressingDp(), InstructionBIT()],
                [AddressingDp(), InstructionAND()],
                [AddressingDpRmw(), InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())],
                [AddressingDpIdrLong(), InstructionAND()],
                [AddressingStackPull(true), InstructionSetRegister(Instruction.PLP, 'P')],
                [AddressingImmediateMemory(), InstructionAND(true)],
                [AddressingAccumulator(), InstructionASLRegister(Instruction.ROL, regs.GetStatusFlagC())],
                [AddressingStackPull(false, false), InstructionSetRegister(Instruction.PLD, 'D')],
                [AddressingAbsDbr(), InstructionBIT()],
                [AddressingAbsDbr(), InstructionAND()],
                [AddressingAbsRmw(), InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())],
                [AddressingAbsLong(), InstructionAND()],
                [AddressingRel(), InstructionBranch(Instruction.BMI, regs.GetStatusFlagN())],
                [AddressingDpIdrIdxY(false), InstructionAND()],
                [AddressingDpIdr(), InstructionAND()],
                [AddressingStackRelIdrIdxY(), InstructionAND()],
                [AddressingDpIdxX(), InstructionBIT()],
                [AddressingDpIdxX(), InstructionAND()],
                [AddressingDpIdxXRmw(), InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())],
                [AddressingDpIdrLongIdxY(), InstructionAND()],
                [AddressingImplied(), InstructionSetFlag(Instruction.SEC, 0x01)],
                [AddressingAbsIdxY(false), InstructionAND()],
                [AddressingAccumulator(), InstructionDECRegister()],
                [AddressingImplied(), InstructionTxx(Instruction.TSC, regs.S, 'C', false)],
                [AddressingAbsIdxX(false), InstructionBIT()],
                [AddressingAbsIdxX(false), InstructionAND()],
                [AddressingAbsIdxXRmw(), InstructionASLMemory(Instruction.ROL, regs.GetStatusFlagC())],
                [AddressingLongIdxX(), InstructionAND()],
                [AddressingStackReturnInterrupt(), InstructionJump(Instruction.RTI, 0)],
                [AddressingDpIdxIdrX(), InstructionEOR()],
                [AddressingImmediateImm8(), InstructionDummy(Instruction.WDM)],
                [AddressingStackRel(), InstructionEOR()],
                [AddressingXyc(), InstructionBlockMove(Instruction.MVP, -1)],
                [AddressingDp(), InstructionEOR()],
                [AddressingDpRmw(), InstructionLSRMemory(Instruction.LSR, false)],
                [AddressingDpIdrLong(), InstructionEOR()],
                [AddressingStackPush(regs.GetRegisterA(), flagM), InstructionDummy(Instruction.PHA)],
                [AddressingImmediateMemory(), InstructionEOR(true)],
                [AddressingAccumulator(), InstructionLSRRegister(Instruction.LSR, false)],
                [AddressingStackPush(regs.PB, true), InstructionDummy(Instruction.PHK)],
                [AddressingAbsPbr(false), InstructionJump(Instruction.JMP, 0)],
                [AddressingAbsDbr(), InstructionEOR()],
                [AddressingAbsRmw(), InstructionLSRMemory(Instruction.LSR, false)],
                [AddressingAbsLong(), InstructionEOR()],
                [AddressingRel(), InstructionBranch(Instruction.BVC, !regs.GetStatusFlagV())],
                [AddressingDpIdrIdxY(false), InstructionEOR()],
                [AddressingDpIdr(), InstructionEOR()],
                [AddressingStackRelIdrIdxY(), InstructionEOR()],
                [AddressingXyc(), InstructionBlockMove(Instruction.MVN, 1)],
                [AddressingDpIdxX(), InstructionEOR()],
                [AddressingDpIdxXRmw(), InstructionLSRMemory(Instruction.LSR, false)],
                [AddressingDpIdrLongIdxY(), InstructionEOR()],
                [AddressingImplied(), InstructionClearFlag(Instruction.CLI, 0x04)],
                [AddressingAbsIdxY(false), InstructionEOR()],
                [AddressingStackPush(regs.GetRegisterY(), flagX), InstructionDummy(Instruction.PHY)],
                [AddressingImplied(), InstructionTxx(Instruction.TCD, regs.GetRegisterA(true), 'D', false)],
                [AddressingAbsLong(false), InstructionJump(Instruction.JML, 0)],
                [AddressingAbsIdxX(false), InstructionEOR()],
                [AddressingAbsIdxXRmw(), InstructionLSRMemory(Instruction.LSR, false)],
                [AddressingLongIdxX(), InstructionEOR()],
                [AddressingStackReturn(true), InstructionJump(Instruction.RTS, 1)],
                [AddressingDpIdxIdrX(), InstructionADC()],
                [AddressingRelLong(), InstructionPER()],
                [AddressingStackRel(), InstructionADC()],
                [AddressingDp(), InstructionSTZ()],
                [AddressingDp(), InstructionADC()],
                [AddressingDpRmw(), InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())],
                [AddressingDpIdrLong(), InstructionADC()],
                [AddressingStackPull(flagM), InstructionSetRegister(Instruction.PLA, 'A')],
                [AddressingImmediateMemory(), InstructionADC(true)],
                [AddressingAccumulator(), InstructionLSRRegister(Instruction.ROR, regs.GetStatusFlagC())],
                [AddressingStackReturn(false), InstructionJump(Instruction.RTL, 1)],
                [AddressingAbsIdrJump(true), InstructionJump(Instruction.JMP, 0)],
                [AddressingAbsDbr(), InstructionADC()],
                [AddressingAbsRmw(), InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())],
                [AddressingAbsLong(), InstructionADC()],
                [AddressingRel(), InstructionBranch(Instruction.BVC, regs.GetStatusFlagV())],
                [AddressingDpIdrIdxY(false), InstructionADC()],
                [AddressingDpIdr(), InstructionADC()],
                [AddressingStackRelIdrIdxY(), InstructionADC()],
                [AddressingDpIdxX(), InstructionSTZ()],
                [AddressingDpIdxX(), InstructionADC()],
                [AddressingDpIdxXRmw(), InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())],
                [AddressingDpIdrLongIdxY(), InstructionADC()],
                [AddressingImplied(), InstructionSetFlag(Instruction.SEI, 0x04)],
                [AddressingAbsIdxY(false), InstructionADC()],
                [AddressingStackPull(flagX), InstructionSetRegister(Instruction.PLY, 'Y')],
                [AddressingImplied(), InstructionTxx(Instruction.TDC, regs.D, 'C', false)],
                [AddressingAbsIdxIdrX(false), InstructionJump(Instruction.JMP, 0)],
                [AddressingAbsIdxX(false), InstructionADC()],
                [AddressingAbsIdxXRmw(), InstructionLSRMemory(Instruction.ROR, regs.GetStatusFlagC())],
                [AddressingLongIdxX(), InstructionADC()],
                [AddressingRel(), InstructionBranch(Instruction.BRA, true)],
                [AddressingDpIdxIdrX(), InstructionSTA()],
                [AddressingRelLong(), InstructionBRL()],
                [AddressingStackRel(), InstructionSTA()],
                [AddressingDp(), InstructionSTY()],
                [AddressingDp(), InstructionSTA()],
                [AddressingDp(), InstructionSTX()],
                [AddressingDpIdrLong(), InstructionSTA()],
                [AddressingImplied(), InstructionDEY()],
                [AddressingImmediateMemory(), InstructionBIT(true)],
                [AddressingImplied(), InstructionTxx(Instruction.TXA, regs.GetRegisterX(), 'A', flagM)],
                [AddressingStackPush(regs.DB, true), InstructionDummy(Instruction.PHB)],
                [AddressingAbsDbr(), InstructionSTY()],
                [AddressingAbsDbr(), InstructionSTA()],
                [AddressingAbsDbr(), InstructionSTX()],
                [AddressingAbsLong(), InstructionSTA()],
                [AddressingRel(), InstructionBranch(Instruction.BCC, !regs.GetStatusFlagC())],
                [AddressingDpIdrIdxY(true), InstructionSTA()],
                [AddressingDpIdr(), InstructionSTA()],
                [AddressingStackRelIdrIdxY(), InstructionSTA()],
                [AddressingDpIdxX(), InstructionSTY()],
                [AddressingDpIdxX(), InstructionSTA()],
                [AddressingDpIdxY(), InstructionSTX()],
                [AddressingDpIdrLongIdxY(), InstructionSTA()],
                [AddressingImplied(), InstructionTxx(Instruction.TYA, regs.GetRegisterY(), 'A', flagM)],
                [AddressingAbsIdxY(true), InstructionSTA()],
                [AddressingImplied(), InstructionTxx(Instruction.TXS, regs.GetRegisterX(), 'S', null)],
                [AddressingImplied(), InstructionTxx(Instruction.TXY, regs.GetRegisterX(), 'Y', flagX)],
                [AddressingAbsDbr(), InstructionSTZ()],
                [AddressingAbsIdxX(true), InstructionSTA()],
                [AddressingAbsIdxX(true), InstructionSTZ()],
                [AddressingLongIdxX(), InstructionSTA()],
                [AddressingImmediateIndex(), InstructionLDY(true)],
                [AddressingDpIdxIdrX(), InstructionLDA()],
                [AddressingImmediateIndex(), InstructionLDX(true)],
                [AddressingStackRel(), InstructionLDA()],
                [AddressingDp(), InstructionLDY()],
                [AddressingDp(), InstructionLDA()],
                [AddressingDp(), InstructionLDX()],
                [AddressingDpIdrLong(), InstructionLDA()],
                [AddressingImplied(), InstructionTxx(Instruction.TAY, regs.GetRegisterA(true), 'Y', flagX)],
                [AddressingImmediateMemory(), InstructionLDA(true)],
                [AddressingImplied(), InstructionTxx(Instruction.TAX, regs.GetRegisterA(true), 'X', flagX)],
                [AddressingStackPull(true, false), InstructionSetRegister(Instruction.PLB, 'DB')],
                [AddressingAbsDbr(), InstructionLDY()],
                [AddressingAbsDbr(), InstructionLDA()],
                [AddressingAbsDbr(), InstructionLDX()],
                [AddressingAbsLong(), InstructionLDA()],
                [AddressingRel(), InstructionBranch(Instruction.BCS, regs.GetStatusFlagC())],
                [AddressingDpIdrIdxY(false), InstructionLDA()],
                [AddressingDpIdr(), InstructionLDA()],
                [AddressingStackRelIdrIdxY(), InstructionLDA()],
                [AddressingDpIdxX(), InstructionLDY()],
                [AddressingDpIdxX(), InstructionLDA()],
                [AddressingDpIdxY(), InstructionLDX()],
                [AddressingDpIdrLongIdxY(), InstructionLDA()],
                [AddressingImplied(), InstructionClearFlag(Instruction.CLV, 0x40)],
                [AddressingAbsIdxY(false), InstructionLDA()],
                [AddressingImplied(), InstructionTxx(Instruction.TSX, regs.S, 'X', flagX)],
                [AddressingImplied(), InstructionTxx(Instruction.TXY, regs.GetRegisterY(), 'X', flagX)],
                [AddressingAbsIdxX(false), InstructionLDY()],
                [AddressingAbsIdxX(false), InstructionLDA()],
                [AddressingAbsIdxY(false), InstructionLDX()],
                [AddressingLongIdxX(), InstructionLDA()],
                [AddressingImmediateIndex(), InstructionCPY(true)],
                [AddressingDpIdxIdrX(), InstructionCMP()],
                [AddressingImmediateImm8(), InstructionREP()],
                [AddressingStackRel(), InstructionCMP()],
                [AddressingDp(), InstructionCPY()],
                [AddressingDp(), InstructionCMP()],
                [AddressingDpRmw(), InstructionDECMemory()],
                [AddressingDpIdrLong(), InstructionCMP()],
                [AddressingImplied(), InstructionINY()],
                [AddressingImmediateMemory(), InstructionCMP(true)],
                [AddressingImplied(), InstructionDEX()],
                [AddressingImplied(), InstructionWAI()],
                [AddressingAbsDbr(), InstructionCPY()],
                [AddressingAbsDbr(), InstructionCMP()],
                [AddressingAbsRmw(), InstructionDECMemory()],
                [AddressingAbsLong(), InstructionCMP()],
                [AddressingRel(), InstructionBranch(Instruction.BNE, !regs.GetStatusFlagZ())],
                [AddressingDpIdrIdxY(false), InstructionCMP()],
                [AddressingDpIdr(), InstructionCMP()],
                [AddressingStackRelIdrIdxY(), InstructionCMP()],
                [AddressingDpIdr(), InstructionPEI()],
                [AddressingDpIdxX(), InstructionCMP()],
                [AddressingDpIdxXRmw(), InstructionDECMemory()],
                [AddressingDpIdrLongIdxY(), InstructionCMP()],
                [AddressingImplied(), InstructionClearFlag(Instruction.CLD, 0x08)],
                [AddressingAbsIdxY(false), InstructionCMP()],
                [AddressingStackPush(regs.GetRegisterX(), flagX), InstructionDummy(Instruction.PHX)],
                [AddressingImplied(), InstructionSTP()],
                [AddressingAbsIdrJump(false), InstructionJump(Instruction.JML, 0)],
                [AddressingAbsIdxX(false), InstructionCMP()],
                [AddressingAbsIdxXRmw(), InstructionDECMemory()],
                [AddressingLongIdxX(), InstructionCMP()],
                [AddressingImmediateIndex(), InstructionCPX(true)],
                [AddressingDpIdxIdrX(), InstructionSBC()],
                [AddressingImmediateImm8(), InstructionSEP()],
                [AddressingStackRel(), InstructionSBC()],
                [AddressingDp(), InstructionCPX()],
                [AddressingDp(), InstructionSBC()],
                [AddressingDpRmw(), InstructionINCMemory()],
                [AddressingDpIdrLong(), InstructionSBC()],
                [AddressingImplied(), InstructionINX()],
                [AddressingImmediateMemory(), InstructionSBC(true)],
                [AddressingImplied(), InstructionDummy(Instruction.NOP)],
                [AddressingImplied(true), InstructionXBA()],
                [AddressingAbsDbr(), InstructionCPX()],
                [AddressingAbsDbr(), InstructionSBC()],
                [AddressingAbsRmw(), InstructionINCMemory()],
                [AddressingAbsLong(), InstructionSBC()],
                [AddressingRel(), InstructionBranch(Instruction.BEQ, regs.GetStatusFlagZ())],
                [AddressingDpIdrIdxY(false), InstructionSBC()],
                [AddressingDpIdr(), InstructionSBC()],
                [AddressingStackRelIdrIdxY(), InstructionSBC()],
                [AddressingAbsDbr(), InstructionPEA()],
                [AddressingDpIdxX(), InstructionSBC()],
                [AddressingDpIdxXRmw(), InstructionINCMemory()],
                [AddressingDpIdrLongIdxY(), InstructionSBC()],
                [AddressingImplied(), InstructionSetFlag(Instruction.SED, 0x08)],
                [AddressingAbsIdxY(false), InstructionSBC()],
                [AddressingStackPull(flagX), InstructionSetRegister(Instruction.PLX, 'X')],
                [AddressingImplied(), InstructionXCE()],
                [AddressingAbsIdxIdrX(true), InstructionJump(Instruction.JSR, 0)],
                [AddressingAbsIdxX(false), InstructionSBC()],
                [AddressingAbsIdxXRmw(), InstructionINCMemory()],
                [AddressingLongIdxX(), InstructionSBC()],
            ];
            instructionFunction = InstructionTable[opcode[0].Data];
            if (!instructionFunction) {
                console.log(`[ERROR] Unimplemented instruction $${Utility.Format.ToHexString(startPC, 6)}: $${Utility.Format.ToHexString(opcode[0].Data, 2)}`);
                return;
            }
            let execute;
            do {
                execute = instructionFunction[0].next();
                this.CpuCycleCounter++;
                if (execute.done) {
                    break;
                }
                yield;
            } while (!execute.done);
        }
        *ExecuteInterrupt() {
            let instruction = Instruction.RST;
            let vector = InterruptType.EmulationRST;
            if (this.PendingAbt) {
                instruction = Instruction.ABT;
                vector = (this.Registers.GetStatusFlagE()) ? InterruptType.EmulationABT : InterruptType.NativeABT;
                this.PendingNmi = false;
            }
            else if (this.PendingNmi) {
                instruction = Instruction.NMI;
                vector = (this.Registers.GetStatusFlagE()) ? InterruptType.EmulationNMI : InterruptType.NativeNMI;
                this.PendingNmi = false;
            }
            else if (this.PendingIrq && !this.Registers.GetStatusFlagI()) {
                instruction = Instruction.IRQ;
                vector = (this.Registers.GetStatusFlagE()) ? InterruptType.EmulationIRQ : InterruptType.NativeIRQ;
                this.PendingIrq = false;
            }
            else {
                return false;
            }
            const cpu = this;
            const log = new StepLog();
            this.Logs.push(log);
            log.MasterCycle = this.MasterCycleCounter;
            log.CpuCycle = this.CpuCycleCounter;
            log.Registers = this.GetRegisters();
            log.InstructionAddress = this.Registers.GetFullProgramCounter();
            log.InstructionLength = 0;
            log.Instruction = instruction;
            log.Opcode = 0;
            log.IndirectAddress = vector;
            log.Operand1 = vector;
            function pushDummyAccess(accessType, speed, offset) {
                const address = (cpu.Memory.AddressBus & 0xFF0000) + Utility.Type.ToWord((cpu.Memory.AddressBus & 0x00FFFF) + offset);
                const dummyAccess = cpu.ReadDataByte(accessType, address);
                if (speed === null) {
                    speed = dummyAccess[0].Speed;
                }
                log.AccessLog.push({
                    AddressBus: address,
                    DataBus: cpu.Memory.DataBus,
                    Region: dummyAccess[1].Region,
                    Type: accessType,
                    Cycle: speed,
                });
            }
            function pushPushStack(value) {
                value = Utility.Type.ToByte(value);
                const address = cpu.Registers.S;
                const result = cpu.WriteDataByte(AccessType.PushStack, address, value);
                cpu.Registers.SetRegisterS(cpu.Registers.S - 1);
                log.AccessLog.push({
                    AddressBus: address,
                    DataBus: value,
                    Region: result[1].Region,
                    Type: result[1].Type,
                    Cycle: result[1].Cycle,
                });
            }
            function pushReadAccess(address) {
                const access = cpu.ReadDataByte(AccessType.Read, address);
                log.AccessLog.push({
                    AddressBus: address,
                    DataBus: cpu.Memory.DataBus,
                    Region: access[1].Region,
                    Type: access[1].Type,
                    Cycle: access[0].Speed,
                });
                return access[0].Data;
            }
            pushDummyAccess(AccessType.ReadDummy, null, 0);
            yield;
            if (!cpu.Registers.GetStatusFlagE()) {
                pushDummyAccess(AccessType.ReadDummy, AccessSpeed.Fast, 0);
                yield;
            }
            pushPushStack(cpu.Registers.PB);
            yield;
            pushPushStack(cpu.Registers.PC >> 8);
            yield;
            pushPushStack(cpu.Registers.PC);
            yield;
            pushPushStack(cpu.Registers.P);
            yield;
            const effectiveAddressLow = pushReadAccess(vector);
            yield;
            const effectiveAddressHigh = pushReadAccess(vector + 1);
            const effectiveAddress = (effectiveAddressHigh << 8) | (effectiveAddressLow);
            log.EffectiveAddress = effectiveAddress;
            this.Registers.SetFullProgramCounter(effectiveAddress);
            this.CpuSlept = false;
            return true;
        }
        JumpInterruptHandler(interrupt) {
            const readAddress = interrupt;
            const address = (this.Memory.ReadByte(readAddress).Data) |
                (this.Memory.ReadByte(readAddress + 1).Data << 8);
            this.Registers.SetFullProgramCounter(address);
        }
        IncrementProgramCounter() {
            const address = this.Registers.GetFullProgramCounter();
            this.Registers.SetProgramCounter(address + 1);
        }
        FetchProgramByte(accessType, incrementPC = true) {
            const address = this.Registers.GetFullProgramCounter();
            const access = this.Memory.ReadByte(address);
            if (incrementPC) {
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
        ReadDataByte(accessType, address) {
            const access = this.Memory.ReadByte(address);
            return [access, {
                    AddressBus: address,
                    DataBus: access.Data,
                    Region: access.Region,
                    Type: accessType,
                    Cycle: access.Speed,
                }];
        }
        WriteDataByte(accessType, address, value) {
            value = Utility.Type.ToByte(value);
            const access = this.Memory.WriteByte(address, value, false);
            return [access, {
                    AddressBus: address,
                    DataBus: value,
                    Region: access.Region,
                    Type: accessType,
                    Cycle: access.Speed,
                }];
        }
    }
    Emulator.Cpu = Cpu;
    class Registers {
        constructor() {
            this.A = 0;
            this.X = 0;
            this.Y = 0;
            this.S = 0x01FD;
            this.PC = 0;
            this.P = 0x34;
            this.D = 0;
            this.PB = 0;
            this.DB = 0;
            this.E = true;
        }
        SetRegisters(dict) {
            if (dict['E'] !== undefined) {
                this.E = !!dict['E'];
            }
            for (const key in dict) {
                const value = dict[key.toUpperCase()];
                switch (key) {
                    case 'A':
                        this.SetRegisterA(value);
                        break;
                    case 'X':
                        this.SetRegisterX(value);
                        break;
                    case 'Y':
                        this.SetRegisterY(value);
                        break;
                    case 'S':
                        this.SetRegisterS(value);
                        break;
                    case 'PC':
                        this.PC = Utility.Type.ToWord(value);
                        break;
                    case 'P':
                        this.SetRegisterP(value);
                        break;
                    case 'D':
                        this.D = Utility.Type.ToWord(value);
                        break;
                    case 'PB':
                        this.PB = Utility.Type.ToByte(value);
                        break;
                    case 'DB':
                        this.DB = Utility.Type.ToByte(value);
                        break;
                    case 'C':
                        this.SetRegisterA(value, true);
                        break;
                }
            }
        }
        Clone() {
            const clone = new Registers();
            clone.A = this.A;
            clone.X = this.X;
            clone.Y = this.Y;
            clone.S = this.S;
            clone.PC = this.PC;
            clone.P = this.P;
            clone.D = this.D;
            clone.PB = this.PB;
            clone.DB = this.DB;
            clone.E = this.E;
            return clone;
        }
        ToString() {
            const strA = Utility.Format.ToHexString(this.A, 4);
            const strX = Utility.Format.ToHexString(this.X, 4);
            const strY = Utility.Format.ToHexString(this.Y, 4);
            const strS = Utility.Format.ToHexString(this.S, 4);
            const strPC = Utility.Format.ToHexString(this.PB, 2) + Utility.Format.ToHexString(this.PC, 4);
            const strP = Utility.Format.ToHexString(this.P, 2);
            const strD = Utility.Format.ToHexString(this.D, 4);
            const strDB = Utility.Format.ToHexString(this.DB, 2);
            return `PC=${strPC},`
                + `A=${strA},X=${strX},Y=${strY},S=${strS},`
                + `P=${strP} ${this.ToStringStatus()},`
                + `D=${strD},DB=${strDB}`;
        }
        ToStringStatus() {
            const emulationStatus = 'nvrbdizcE';
            const nativeStatus = 'nvmxdizce';
            const baseStatus = (this.E) ? emulationStatus : nativeStatus;
            let status = '';
            for (let i = 0; i < 8; i++) {
                const bit = (this.P & (1 << (7 - i))) != 0;
                const c = baseStatus[i];
                status += (bit) ? c.toUpperCase() : c.toLowerCase();
            }
            status += baseStatus[8];
            return status;
        }
        GetStatusFlagN() {
            return ((this.P >> 7) & 1) != 0;
        }
        GetStatusFlagV() {
            return ((this.P >> 6) & 1) != 0;
        }
        GetStatusFlagM() {
            if (this.GetStatusFlagE()) {
                return true;
            }
            return ((this.P >> 5) & 1) != 0;
        }
        GetStatusFlagX() {
            if (this.GetStatusFlagE()) {
                return true;
            }
            return ((this.P >> 4) & 1) != 0;
        }
        GetStatusFlagD() {
            return ((this.P >> 3) & 1) != 0;
        }
        GetStatusFlagI() {
            return ((this.P >> 2) & 1) != 0;
        }
        GetStatusFlagZ() {
            return ((this.P >> 1) & 1) != 0;
        }
        GetStatusFlagC() {
            return ((this.P >> 0) & 1) != 0;
        }
        GetStatusFlagE() {
            return this.E;
        }
        SetStatusFlagN(b) {
            this.SetStatusFlag(b, 7);
        }
        SetStatusFlagV(b) {
            this.SetStatusFlag(b, 6);
        }
        SetStatusFlagM(b, forceUpdate = false) {
            if ((!this.GetStatusFlagE()) || forceUpdate) {
                this.SetStatusFlag(b, 5);
            }
        }
        SetStatusFlagX(b, forceUpdate = false) {
            if ((!this.GetStatusFlagE()) || forceUpdate) {
                this.SetStatusFlag(b, 4);
            }
        }
        SetStatusFlagD(b) {
            this.SetStatusFlag(b, 3);
        }
        SetStatusFlagI(b) {
            this.SetStatusFlag(b, 2);
        }
        SetStatusFlagZ(b) {
            this.SetStatusFlag(b, 1);
        }
        SetStatusFlagC(b) {
            this.SetStatusFlag(b, 0);
        }
        SetStatusFlagE(b) {
            this.E = b;
            this.ToEmulationMode();
        }
        SetStatusFlag(b, n) {
            const m = 1 << n;
            let p = (this.P & (0xFF ^ m)) | ((b) ? m : 0);
            this.SetRegisterP(p);
        }
        SetRegisterP(p) {
            this.P = Utility.Type.ToByte(p);
            this.ToEmulationMode();
            this.UpdateIndexRegister();
        }
        SwapStatusFlagCE() {
            let e = this.GetStatusFlagC();
            this.SetStatusFlagC(this.E);
            this.E = e;
            this.ToEmulationMode();
            this.UpdateIndexRegister();
        }
        ToEmulationMode() {
            if (!this.GetStatusFlagE()) {
                return;
            }
            this.P |= 0x30;
            this.S = (this.S & 0x00FF) | 0x0100;
        }
        UpdateIndexRegister() {
            if (!this.GetStatusFlagE() && !this.GetStatusFlagX()) {
                return;
            }
            this.X &= 0x00FF;
            this.Y &= 0x00FF;
        }
        GetRegisterA(forceFull = false) {
            if (this.GetStatusFlagM() && (!forceFull)) {
                return Utility.Type.ToByte(this.A);
            }
            else {
                return Utility.Type.ToWord(this.A);
            }
        }
        GetRegisterX(forceFull = false) {
            if (this.GetStatusFlagX() && (!forceFull)) {
                return Utility.Type.ToByte(this.X);
            }
            else {
                return Utility.Type.ToWord(this.X);
            }
        }
        GetRegisterY(forceFull = false) {
            if (this.GetStatusFlagX() && (!forceFull)) {
                return Utility.Type.ToByte(this.Y);
            }
            else {
                return Utility.Type.ToWord(this.Y);
            }
        }
        SetRegisterA(value, forceFull = false) {
            if (this.GetStatusFlagM() && (!forceFull)) {
                this.A = (this.A & 0xFF00) | Utility.Type.ToByte(value);
            }
            else {
                this.A = Utility.Type.ToWord(value);
            }
        }
        SetRegisterX(value, forceFull = false) {
            if (this.GetStatusFlagX() && (!forceFull)) {
                this.X = Utility.Type.ToByte(value);
            }
            else {
                this.X = Utility.Type.ToWord(value);
            }
        }
        SetRegisterY(value, forceFull = false) {
            if (this.GetStatusFlagX() && (!forceFull)) {
                this.Y = Utility.Type.ToByte(value);
            }
            else {
                this.Y = Utility.Type.ToWord(value);
            }
        }
        SetRegisterS(value) {
            if (this.GetStatusFlagE()) {
                this.S = Utility.Type.ToWord(0x0100 | (value & 0x00FF));
            }
            else {
                this.S = Utility.Type.ToWord(value);
            }
        }
        GetMaskM() {
            return (this.GetStatusFlagM()) ? 0x00FF : 0xFFFF;
        }
        GetMaskX() {
            return (this.GetStatusFlagX()) ? 0x00FF : 0xFFFF;
        }
        GetMsbMaskM() {
            return (this.GetStatusFlagM()) ? 0x0080 : 0x8000;
        }
        GetMsbMaskX() {
            return (this.GetStatusFlagX()) ? 0x0080 : 0x8000;
        }
        GetRegisterStringA(value = this.A) {
            let digit = (this.GetStatusFlagM()) ? 2 : 4;
            return Utility.Format.ToHexString(value, digit);
        }
        GetRegisterStringX(value = this.X) {
            let digit = (this.GetStatusFlagX()) ? 2 : 4;
            return Utility.Format.ToHexString(value, digit);
        }
        GetRegisterStringY(value = this.Y) {
            let digit = (this.GetStatusFlagX()) ? 2 : 4;
            return Utility.Format.ToHexString(value, digit);
        }
        SetFullProgramCounter(value) {
            this.PB = Utility.Type.ToByte(value >> 16);
            this.PC = Utility.Type.ToWord(value);
        }
        SetProgramCounter(value) {
            value = Utility.Type.ToWord(value);
            this.PC = value;
        }
        GetFullProgramCounter() {
            return this.ToRelativeAddress(0);
        }
        ToDirectAddress(address) {
            return Utility.Type.ToWord(this.D + (address & this.GetOperandMask()));
        }
        ToDataAddress(address) {
            return Utility.Type.ToLong((this.DB << 16) + address);
        }
        ToProgramAddress(address) {
            return (this.PB << 16) | Utility.Type.ToWord(address);
        }
        ToRelativeAddress(offset) {
            return (this.PB << 16) | Utility.Type.ToWord(this.PC + offset);
        }
        IsZeroDRegisterLow() {
            return Utility.Type.ToByte(this.D) == 0;
        }
        GetOperandMask() {
            return (this.GetStatusFlagE() && this.IsZeroDRegisterLow()) ? 0x00FF : 0xFFFF;
        }
    }
    Emulator.Registers = Registers;
    ;
    class SnesMemory {
        constructor() {
            this.Cpu = null;
            this.AddressSpace = {};
            this.SourceSpace = {};
            this.ROMMapping = RomMapping.LoROM;
            this.IsFastROM = false;
            this.CpuRegister = new CpuRegister(this);
            this.PpuRegister = new PpuRegister(this);
            this.DmaChannels = [];
            this.AddressBus = 0;
            this.DataBus = 0;
            this.Mode7Latch = 0;
            this.Ppu1Bus = 0;
            this.Ppu2Bus = 0;
            for (let i = 0; i < 8; i++) {
                this.DmaChannels[i] = new DmaChannel();
            }
        }
        ReadByte(address) {
            var _a, _b;
            const [region, realAddress] = this.ToRealAddress(address);
            const [dataIO, maskIO] = this.HookIORead(realAddress);
            let data = (this.DataBus & (~maskIO)) | (dataIO & maskIO);
            const enableRegion = (region !== AccessRegion.OpenBus) && (region !== AccessRegion.IO);
            if (enableRegion) {
                data = (_a = this.AddressSpace[realAddress]) !== null && _a !== void 0 ? _a : 0;
            }
            address = Utility.Type.ToLong(address);
            data = Utility.Type.ToByte(data);
            const speed = this.GetAccessSpeed(address);
            this.UpdateBus(address, data);
            const source = (_b = this.SourceSpace[realAddress]) !== null && _b !== void 0 ? _b : null;
            const result = {
                Region: region,
                Data: data,
                Speed: speed,
                Source: source,
            };
            return result;
        }
        WriteByte(address, data, romWrite = false) {
            const [region, realAddress] = this.ToRealAddress(address);
            if (!this.HookIOWrite(realAddress, data)) {
                const enableRegion = (region !== AccessRegion.ROM) && (region !== AccessRegion.OpenBus) && (region !== AccessRegion.IO);
                if (enableRegion || romWrite) {
                    this.AddressSpace[realAddress] = Utility.Type.ToByte(data);
                }
            }
            address = Utility.Type.ToLong(address);
            data = Utility.Type.ToByte(data);
            const speed = this.GetAccessSpeed(address);
            this.UpdateBus(address, data);
            const result = {
                Region: region,
                Speed: speed,
            };
            return result;
        }
        WriteSourceByte(address, data, source) {
            const [region, realAddress] = this.ToRealAddress(address);
            const enableRegion = (region !== AccessRegion.OpenBus) && (region !== AccessRegion.IO);
            if (enableRegion) {
                this.AddressSpace[realAddress] = Utility.Type.ToByte(data);
                if (source) {
                    this.SourceSpace[realAddress] = source;
                }
            }
        }
        ToRealAddress(address) {
            const bank = Utility.Type.ToByte(address >> 16);
            const page = Utility.Type.ToWord(address);
            if (Utility.Math.IsRange(bank, 0x7E, 0x80)) {
                return [AccessRegion.MainRAM, address];
            }
            else if ((address & 0x40E000) === 0x000000) {
                address = 0x7E0000 | (address & 0x001FFF);
                return [AccessRegion.MainRAM, address];
            }
            else if (((bank & 0x40) === 0) && Utility.Math.IsRange(page, 0x2000, 0x6000)) {
                address = (address & 0x007FFF);
                return [AccessRegion.IO, address];
            }
            if (this.ROMMapping === RomMapping.LoROM) {
                if (((bank & 0x40) === 0) && Utility.Math.IsRange(page, 0x6000, 0x8000)) {
                    return [AccessRegion.OpenBus, address];
                }
                else if (Utility.Math.IsRange(bank, 0x70, 0x7E) && (page < 0x8000)) {
                    address = (address | 0x800000);
                    return [AccessRegion.StaticRAM, address];
                }
                else {
                    address = (address | 0x808000);
                    return [AccessRegion.ROM, address];
                }
            }
            else if (this.ROMMapping === RomMapping.HiROM) {
                if (Utility.Math.IsRange(bank & 0x7F, 0x00, 0x10) && Utility.Math.IsRange(page, 0x6000, 0x8000)) {
                    return [AccessRegion.OpenBus, address];
                }
                else if (Utility.Math.IsRange(bank & 0x7F, 0x00, 0x40) && Utility.Math.IsRange(page, 0x6000, 0x8000)) {
                    address = (address | 0x300000) & 0x3FFFFF;
                    return [AccessRegion.StaticRAM, address];
                }
                else {
                    address = (address | 0xC00000);
                    return [AccessRegion.ROM, address];
                }
            }
            return [AccessRegion.ROM, address];
        }
        HookIORead(address) {
            switch (address) {
                case 0x002134:
                    return [this.PpuRegister.MPYL, 0xFF];
                case 0x002135:
                    return [this.PpuRegister.MPYM, 0xFF];
                case 0x002136:
                    return [this.PpuRegister.MPYH, 0xFF];
                case 0x004214:
                    return [this.CpuRegister.RDDIVL, 0xFF];
                case 0x004215:
                    return [this.CpuRegister.RDDIVH, 0xFF];
                case 0x004216:
                    return [this.CpuRegister.RDMPYL, 0xFF];
                case 0x004217:
                    return [this.CpuRegister.RDMPYH, 0xFF];
            }
            if ((address & 0xFFFF80) == 0x004300) {
                const dmaChannel = (address >> 4) & 0x07;
                const registerNumber = address & 0x0F;
                const registerValue = this.DmaChannels[dmaChannel].ReadRegister(registerNumber);
                if (registerValue !== null) {
                    return [registerValue, 0xFF];
                }
            }
            return [0, 0];
        }
        HookIOWrite(address, data) {
            switch (address) {
                case 0x00210D:
                    this.PpuRegister.BG1HOFS = this.UpdateMode7Latch(data) & 0x1FFF;
                    return true;
                case 0x00210E:
                    this.PpuRegister.BG1VOFS = this.UpdateMode7Latch(data) & 0x1FFF;
                    return true;
                case 0x00211B:
                    this.PpuRegister.M7A = this.UpdateMode7Latch(data);
                    this.PpuRegister.StartMultiplication();
                    return true;
                case 0x00211C:
                    this.PpuRegister.M7B = this.UpdateMode7Latch(data);
                    this.PpuRegister.StartMultiplication();
                    return true;
                case 0x00211D:
                    this.PpuRegister.M7C = this.UpdateMode7Latch(data);
                    return true;
                case 0x00210E:
                    this.PpuRegister.M7D = this.UpdateMode7Latch(data);
                    return true;
                case 0x00211F:
                    this.PpuRegister.M7X = this.UpdateMode7Latch(data) & 0x1FFF;
                    return true;
                case 0x002120:
                    this.PpuRegister.M7Y = this.UpdateMode7Latch(data) & 0x1FFF;
                    return true;
                case 0x004200:
                    this.CpuRegister.NMITIMEN = data;
                    return true;
                case 0x004201:
                    this.CpuRegister.WRIO = data;
                    return true;
                case 0x004202:
                    this.CpuRegister.WRMPYA = data;
                    return true;
                case 0x004203:
                    this.CpuRegister.StartMultiplication(data);
                    return true;
                case 0x004204:
                    this.CpuRegister.WRDIVL = data;
                    return true;
                case 0x004205:
                    this.CpuRegister.WRDIVH = data;
                    return true;
                case 0x004206:
                    this.CpuRegister.StartDivision(data);
                    return true;
                case 0x004207:
                case 0x004208:
                case 0x004209:
                case 0x00420A:
                case 0x00420B:
                case 0x00420C:
                    return true;
                case 0x00420D:
                    this.IsFastROM = (data & 1) !== 0;
                    return true;
            }
            if ((address & 0xFFFF80) == 0x004300) {
                const dmaChannel = (address >> 4) & 0x07;
                const registerNumber = address & 0x0F;
                this.DmaChannels[dmaChannel].WriteRegister(registerNumber, data);
                return true;
            }
            return false;
        }
        GetAccessSpeed(address) {
            let speed = (this.IsFastROM) ? AccessSpeed.Fast : AccessSpeed.Slow;
            const bank = address >> 16;
            const page = address & 0x00FFFF;
            if (bank <= 0x3F) {
                if (page <= 0x1FFF) {
                    speed = AccessSpeed.Slow;
                }
                else if (page <= 0x20FF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x21FF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x3FFF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x41FF) {
                    speed = AccessSpeed.XSlow;
                }
                else if (page <= 0x43FF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x5FFF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x7FFF) {
                    speed = AccessSpeed.Slow;
                }
                else if (page <= 0xFFFF) {
                    speed = AccessSpeed.Slow;
                }
            }
            else if (bank <= 0x7D) {
                speed = AccessSpeed.Slow;
            }
            else if (bank <= 0x7F) {
                speed = AccessSpeed.Slow;
            }
            else if (bank <= 0xBF) {
                if (page <= 0x1FFF) {
                    speed = AccessSpeed.Slow;
                }
                else if (page <= 0x20FF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x21FF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x3FFF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x41FF) {
                    speed = AccessSpeed.XSlow;
                }
                else if (page <= 0x43FF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x5FFF) {
                    speed = AccessSpeed.Fast;
                }
                else if (page <= 0x7FFF) {
                    speed = AccessSpeed.Slow;
                }
                else if (page <= 0xFFFF) { }
            }
            else if (bank <= 0xFF) {
            }
            return speed;
        }
        UpdateBus(address, data) {
            this.AddressBus = address;
            this.DataBus = data;
        }
        UpdateMode7Latch(value) {
            value = Utility.Type.ToByte(value);
            this.Mode7Latch = Utility.Type.ToWord(((this.Mode7Latch) << 8) | value);
            return this.Mode7Latch;
        }
        ClockIO(cycle) {
            this.PpuRegister.Step(cycle);
            this.CpuRegister.Step(cycle);
        }
        RequestNmi() {
            var _a;
            if ((this.CpuRegister.NMITIMEN & 0x80) !== 0) {
                (_a = this.Cpu) === null || _a === void 0 ? void 0 : _a.NMI();
            }
        }
        RequestIrq() {
            var _a;
            (_a = this.Cpu) === null || _a === void 0 ? void 0 : _a.IRQ();
        }
    }
    Emulator.SnesMemory = SnesMemory;
    class CpuRegister {
        constructor(Memory) {
            this.Memory = Memory;
            this.NMITIMEN = 0;
            this.WRIO = 0;
            this.WRMPYA = 0;
            this.WRMPYB = 0;
            this.WRDIVL = 0;
            this.WRDIVH = 0;
            this.WRDIVB = 0;
            this.HTIMEL = 0;
            this.HTIMEH = 0;
            this.VTIMEL = 0;
            this.VTIMEH = 0;
            this.MDMAEN = 0;
            this.HDMAEN = 0;
            this.MEMSEL = 0;
            this.RDNMI = 0;
            this.TIMEUP = 0;
            this.HVBJOY = 0;
            this.RDIO = 0;
            this.RDDIVL = 0;
            this.RDDIVH = 0;
            this.RDMPYL = 0;
            this.RDMPYH = 0;
            this.JOY1L = 0;
            this.JOY1H = 0;
            this.JOY2L = 0;
            this.JOY2H = 0;
            this.JOY3L = 0;
            this.JOY3H = 0;
            this.JOY4L = 0;
            this.JOY4H = 0;
            this.shiftMulDiv = 0;
            this.stepMultiplication = 0;
            this.stepDivision = 0;
        }
        StartMultiplication(wrmpyb) {
            this.SetRdMpy(0);
            if ((this.stepMultiplication > 0) || (this.stepDivision > 0)) {
                return;
            }
            this.WRMPYB = wrmpyb;
            this.RDDIVH = this.WRMPYB;
            this.RDDIVL = this.WRMPYA;
            this.shiftMulDiv = this.WRMPYB;
            this.stepMultiplication = 8 + 1;
        }
        StartDivision(wrdivb) {
            this.RDMPYH = this.WRDIVH;
            this.RDMPYL = this.WRDIVL;
            if ((this.stepMultiplication > 0) || (this.stepDivision > 0)) {
                return;
            }
            this.WRDIVB = wrdivb;
            this.shiftMulDiv = this.WRDIVB << 16;
            this.stepDivision = 16 + 1;
        }
        Step(cycle) {
            if (this.stepMultiplication > 0) {
                if (this.stepMultiplication <= 8) {
                    if ((this.GetRdDiv() & 1) === 1) {
                        this.SetRdMpy(this.GetRdMpy() + this.shiftMulDiv);
                    }
                    this.SetRdDiv(this.GetRdDiv() >> 1);
                    this.shiftMulDiv <<= 1;
                }
                this.stepMultiplication--;
            }
            if (this.stepDivision > 0) {
                if (this.stepDivision <= 16) {
                    this.shiftMulDiv >>= 1;
                    const sub = this.GetRdMpy() - this.shiftMulDiv;
                    let carry = 0;
                    if (sub >= 0) {
                        this.SetRdMpy(sub);
                        carry = 1;
                    }
                    this.SetRdDiv((this.GetRdDiv() << 1) | carry);
                }
                this.stepDivision--;
            }
        }
        GetRdMpy() {
            return Utility.Type.ToWord((this.RDMPYH << 8) | this.RDMPYL);
        }
        GetRdDiv() {
            return Utility.Type.ToWord((this.RDDIVH << 8) | this.RDDIVL);
        }
        SetRdMpy(value) {
            this.RDMPYH = Utility.Type.ToByte(value >> 8);
            this.RDMPYL = Utility.Type.ToByte(value);
        }
        SetRdDiv(value) {
            this.RDDIVH = Utility.Type.ToByte(value >> 8);
            this.RDDIVL = Utility.Type.ToByte(value);
        }
    }
    Emulator.CpuRegister = CpuRegister;
    class PpuRegister {
        constructor(Memory) {
            this.Memory = Memory;
            this.INIDISP = 0;
            this.OBSEL = 0;
            this.OAMADDL = 0;
            this.OAMADDH = 0;
            this.OAMDATA = 0;
            this.BGMODE = 0;
            this.MOSAIC = 0;
            this.BG1SC = 0;
            this.BG2SC = 0;
            this.BG3SC = 0;
            this.BG4SC = 0;
            this.BG12NBA = 0;
            this.BG34NBA = 0;
            this.BG1HOFS = 0;
            this.BG1VOFS = 0;
            this.BG2HOFS = 0;
            this.BG2VOFS = 0;
            this.BG3HOFS = 0;
            this.BG3VOFS = 0;
            this.BG4HOFS = 0;
            this.BG4VOFS = 0;
            this.VMAIN = 0;
            this.VMADDL = 0;
            this.VMADDH = 0;
            this.VMDATAL = 0;
            this.VMDATAH = 0;
            this.M7SEL = 0;
            this.M7A = 0;
            this.M7B = 0;
            this.M7C = 0;
            this.M7D = 0;
            this.M7X = 0;
            this.M7Y = 0;
            this.CGADD = 0;
            this.CGDATA = 0;
            this.W12SEL = 0;
            this.W34SEL = 0;
            this.WOBJSEL = 0;
            this.WH0 = 0;
            this.WH1 = 0;
            this.WH2 = 0;
            this.WH3 = 0;
            this.WBGLOG = 0;
            this.WOBJLOG = 0;
            this.TM = 0;
            this.TS = 0;
            this.TMW = 0;
            this.TSW = 0;
            this.CGWSEL = 0;
            this.CGADSUB = 0;
            this.COLDATA = 0;
            this.SETINI = 0;
            this.MPYL = 0;
            this.MPYM = 0;
            this.MPYH = 0;
            this.SLHV = 0;
            this.OAMDATAREAD = 0;
            this.VMDATALREAD = 0;
            this.VMDATAHREAD = 0;
            this.CGDATAREAD = 0;
            this.OPHCT = 0;
            this.OPVCT = 0;
            this.STAT77 = 0;
            this.STAT78 = 0;
            this.APUIO0 = 0;
            this.APUIO1 = 0;
            this.APUIO2 = 0;
            this.APUIO3 = 0;
            this.WMDATA = 0;
            this.WMADDL = 0;
            this.WMADDM = 0;
            this.WMADDH = 0;
            this.stepMultiplication = 0;
        }
        StartMultiplication() {
            this.stepMultiplication = 1;
        }
        Step(cycle) {
            if (this.stepMultiplication > 0) {
                const result = Utility.Type.ToShort(this.M7A) * Utility.Type.ToChar(this.M7B);
                const resultUint = Utility.Type.ToUint(result);
                this.MPYL = Utility.Type.ToByte(resultUint);
                this.MPYM = Utility.Type.ToByte(resultUint >> 8);
                this.MPYH = Utility.Type.ToByte(resultUint >> 16);
                this.stepMultiplication--;
            }
        }
    }
    Emulator.PpuRegister = PpuRegister;
    class DmaChannel {
        constructor() {
            this.DMAPn = 0;
            this.BBADn = 0;
            this.A1TnL = 0;
            this.A1TnH = 0;
            this.A1Bn = 0;
            this.DASnL = 0;
            this.DASnH = 0;
            this.DASBn = 0;
            this.A2AnL = 0;
            this.A2AnH = 0;
            this.NLTRn = 0;
            this.UNUSEDn = 0;
        }
        ReadRegister(registerNumber) {
            switch (registerNumber) {
                case 0x00: return this.DMAPn;
                case 0x01: return this.BBADn;
                case 0x02: return this.A1TnL;
                case 0x03: return this.A1TnH;
                case 0x04: return this.A1Bn;
                case 0x05: return this.DASnL;
                case 0x06: return this.DASnH;
                case 0x07: return this.DASBn;
                case 0x08: return this.A2AnL;
                case 0x09: return this.A2AnH;
                case 0x0A: return this.NLTRn;
                case 0x0B: return this.UNUSEDn;
                case 0x0F: return this.UNUSEDn;
            }
            return null;
        }
        WriteRegister(registerNumber, value) {
            switch (registerNumber) {
                case 0x00:
                    this.DMAPn = value;
                    break;
                case 0x01:
                    this.BBADn = value;
                    break;
                case 0x02:
                    this.A1TnL = value;
                    break;
                case 0x03:
                    this.A1TnH = value;
                    break;
                case 0x04:
                    this.A1Bn = value;
                    break;
                case 0x05:
                    this.DASnL = value;
                    break;
                case 0x06:
                    this.DASnH = value;
                    break;
                case 0x07:
                    this.DASBn = value;
                    break;
                case 0x08:
                    this.A2AnL = value;
                    break;
                case 0x09:
                    this.A2AnH = value;
                    break;
                case 0x0A:
                    this.NLTRn = value;
                    break;
                case 0x0B:
                    this.UNUSEDn = value;
                    break;
                case 0x0F:
                    this.UNUSEDn = value;
                    break;
            }
        }
    }
    Emulator.DmaChannel = DmaChannel;
    let Addressing;
    (function (Addressing) {
        Addressing[Addressing["Implied"] = 0] = "Implied";
        Addressing[Addressing["Accumulator"] = 1] = "Accumulator";
        Addressing[Addressing["Stack"] = 2] = "Stack";
        Addressing[Addressing["Immediate8"] = 3] = "Immediate8";
        Addressing[Addressing["ImmediateMemory"] = 4] = "ImmediateMemory";
        Addressing[Addressing["ImmediateIndex"] = 5] = "ImmediateIndex";
        Addressing[Addressing["Directpage"] = 6] = "Directpage";
        Addressing[Addressing["DirectpageIndexedX"] = 7] = "DirectpageIndexedX";
        Addressing[Addressing["DirectpageIndexedY"] = 8] = "DirectpageIndexedY";
        Addressing[Addressing["DirectpageIndirect"] = 9] = "DirectpageIndirect";
        Addressing[Addressing["DirectpageIndexedIndirectX"] = 10] = "DirectpageIndexedIndirectX";
        Addressing[Addressing["DirectpageIndirectIndexedY"] = 11] = "DirectpageIndirectIndexedY";
        Addressing[Addressing["DirectpageIndirectLong"] = 12] = "DirectpageIndirectLong";
        Addressing[Addressing["DirectpageIndirectLongIndexedY"] = 13] = "DirectpageIndirectLongIndexedY";
        Addressing[Addressing["Absolute"] = 14] = "Absolute";
        Addressing[Addressing["AbsoluteJump"] = 15] = "AbsoluteJump";
        Addressing[Addressing["AbsoluteIndexedX"] = 16] = "AbsoluteIndexedX";
        Addressing[Addressing["AbsoluteIndexedY"] = 17] = "AbsoluteIndexedY";
        Addressing[Addressing["AbsoluteIndirect"] = 18] = "AbsoluteIndirect";
        Addressing[Addressing["AbsoluteIndexedIndirect"] = 19] = "AbsoluteIndexedIndirect";
        Addressing[Addressing["AbsoluteIndirectLong"] = 20] = "AbsoluteIndirectLong";
        Addressing[Addressing["AbsoluteLong"] = 21] = "AbsoluteLong";
        Addressing[Addressing["AbsoluteLongIndexedX"] = 22] = "AbsoluteLongIndexedX";
        Addressing[Addressing["Relative"] = 23] = "Relative";
        Addressing[Addressing["RelativeLong"] = 24] = "RelativeLong";
        Addressing[Addressing["StackRelative"] = 25] = "StackRelative";
        Addressing[Addressing["StackRelativeIndirectIndexedY"] = 26] = "StackRelativeIndirectIndexedY";
        Addressing[Addressing["BlockMove"] = 27] = "BlockMove";
    })(Addressing = Emulator.Addressing || (Emulator.Addressing = {}));
    let Instruction;
    (function (Instruction) {
        Instruction[Instruction["ADC"] = 0] = "ADC";
        Instruction[Instruction["AND"] = 1] = "AND";
        Instruction[Instruction["ASL"] = 2] = "ASL";
        Instruction[Instruction["BCC"] = 3] = "BCC";
        Instruction[Instruction["BCS"] = 4] = "BCS";
        Instruction[Instruction["BEQ"] = 5] = "BEQ";
        Instruction[Instruction["BIT"] = 6] = "BIT";
        Instruction[Instruction["BMI"] = 7] = "BMI";
        Instruction[Instruction["BNE"] = 8] = "BNE";
        Instruction[Instruction["BPL"] = 9] = "BPL";
        Instruction[Instruction["BRA"] = 10] = "BRA";
        Instruction[Instruction["BRK"] = 11] = "BRK";
        Instruction[Instruction["BRL"] = 12] = "BRL";
        Instruction[Instruction["BVC"] = 13] = "BVC";
        Instruction[Instruction["BVS"] = 14] = "BVS";
        Instruction[Instruction["CLC"] = 15] = "CLC";
        Instruction[Instruction["CLD"] = 16] = "CLD";
        Instruction[Instruction["CLI"] = 17] = "CLI";
        Instruction[Instruction["CLV"] = 18] = "CLV";
        Instruction[Instruction["CMP"] = 19] = "CMP";
        Instruction[Instruction["COP"] = 20] = "COP";
        Instruction[Instruction["CPX"] = 21] = "CPX";
        Instruction[Instruction["CPY"] = 22] = "CPY";
        Instruction[Instruction["DEC"] = 23] = "DEC";
        Instruction[Instruction["DEX"] = 24] = "DEX";
        Instruction[Instruction["DEY"] = 25] = "DEY";
        Instruction[Instruction["EOR"] = 26] = "EOR";
        Instruction[Instruction["INC"] = 27] = "INC";
        Instruction[Instruction["INX"] = 28] = "INX";
        Instruction[Instruction["INY"] = 29] = "INY";
        Instruction[Instruction["JML"] = 30] = "JML";
        Instruction[Instruction["JMP"] = 31] = "JMP";
        Instruction[Instruction["JSL"] = 32] = "JSL";
        Instruction[Instruction["JSR"] = 33] = "JSR";
        Instruction[Instruction["LDA"] = 34] = "LDA";
        Instruction[Instruction["LDX"] = 35] = "LDX";
        Instruction[Instruction["LDY"] = 36] = "LDY";
        Instruction[Instruction["LSR"] = 37] = "LSR";
        Instruction[Instruction["MVN"] = 38] = "MVN";
        Instruction[Instruction["MVP"] = 39] = "MVP";
        Instruction[Instruction["NOP"] = 40] = "NOP";
        Instruction[Instruction["ORA"] = 41] = "ORA";
        Instruction[Instruction["PEA"] = 42] = "PEA";
        Instruction[Instruction["PEI"] = 43] = "PEI";
        Instruction[Instruction["PER"] = 44] = "PER";
        Instruction[Instruction["PHA"] = 45] = "PHA";
        Instruction[Instruction["PHB"] = 46] = "PHB";
        Instruction[Instruction["PHD"] = 47] = "PHD";
        Instruction[Instruction["PHK"] = 48] = "PHK";
        Instruction[Instruction["PHP"] = 49] = "PHP";
        Instruction[Instruction["PHX"] = 50] = "PHX";
        Instruction[Instruction["PHY"] = 51] = "PHY";
        Instruction[Instruction["PLA"] = 52] = "PLA";
        Instruction[Instruction["PLB"] = 53] = "PLB";
        Instruction[Instruction["PLD"] = 54] = "PLD";
        Instruction[Instruction["PLP"] = 55] = "PLP";
        Instruction[Instruction["PLX"] = 56] = "PLX";
        Instruction[Instruction["PLY"] = 57] = "PLY";
        Instruction[Instruction["REP"] = 58] = "REP";
        Instruction[Instruction["ROL"] = 59] = "ROL";
        Instruction[Instruction["ROR"] = 60] = "ROR";
        Instruction[Instruction["RTI"] = 61] = "RTI";
        Instruction[Instruction["RTL"] = 62] = "RTL";
        Instruction[Instruction["RTS"] = 63] = "RTS";
        Instruction[Instruction["SBC"] = 64] = "SBC";
        Instruction[Instruction["SEC"] = 65] = "SEC";
        Instruction[Instruction["SED"] = 66] = "SED";
        Instruction[Instruction["SEI"] = 67] = "SEI";
        Instruction[Instruction["SEP"] = 68] = "SEP";
        Instruction[Instruction["STA"] = 69] = "STA";
        Instruction[Instruction["STP"] = 70] = "STP";
        Instruction[Instruction["STX"] = 71] = "STX";
        Instruction[Instruction["STY"] = 72] = "STY";
        Instruction[Instruction["STZ"] = 73] = "STZ";
        Instruction[Instruction["TAX"] = 74] = "TAX";
        Instruction[Instruction["TAY"] = 75] = "TAY";
        Instruction[Instruction["TCD"] = 76] = "TCD";
        Instruction[Instruction["TCS"] = 77] = "TCS";
        Instruction[Instruction["TDC"] = 78] = "TDC";
        Instruction[Instruction["TRB"] = 79] = "TRB";
        Instruction[Instruction["TSB"] = 80] = "TSB";
        Instruction[Instruction["TSC"] = 81] = "TSC";
        Instruction[Instruction["TSX"] = 82] = "TSX";
        Instruction[Instruction["TXA"] = 83] = "TXA";
        Instruction[Instruction["TXS"] = 84] = "TXS";
        Instruction[Instruction["TXY"] = 85] = "TXY";
        Instruction[Instruction["TYA"] = 86] = "TYA";
        Instruction[Instruction["TYX"] = 87] = "TYX";
        Instruction[Instruction["WAI"] = 88] = "WAI";
        Instruction[Instruction["WDM"] = 89] = "WDM";
        Instruction[Instruction["XBA"] = 90] = "XBA";
        Instruction[Instruction["XCE"] = 91] = "XCE";
        Instruction[Instruction["RST"] = 92] = "RST";
        Instruction[Instruction["ABT"] = 93] = "ABT";
        Instruction[Instruction["NMI"] = 94] = "NMI";
        Instruction[Instruction["IRQ"] = 95] = "IRQ";
    })(Instruction = Emulator.Instruction || (Emulator.Instruction = {}));
    const InstructionLength = [
        1 + 0,
        1 + 0,
        1 + 0,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 1,
        1 + 2,
        1 + 2,
        1 + 2,
        1 + 2,
        1 + 2,
        1 + 2,
        1 + 2,
        1 + 3,
        1 + 3,
        1 + 1,
        1 + 2,
        1 + 1,
        1 + 1,
        1 + 2,
    ];
    Emulator.InstructionTable = {
        'ADC': [null, null, null, null, 0x69, null, 0x65, 0x75, null, 0x72, 0x61, 0x71, 0x67, 0x77, 0x6D, null, 0x7D, 0x79, null, null, null, 0x6F, 0x7F, null, null, 0x63, 0x73, null],
        'AND': [null, null, null, null, 0x29, null, 0x25, 0x35, null, 0x32, 0x21, 0x31, 0x27, 0x37, 0x2D, null, 0x3D, 0x39, null, null, null, 0x2F, 0x3F, null, null, 0x23, 0x33, null],
        'ASL': [null, 0x0A, null, null, null, null, 0x06, 0x16, null, null, null, null, null, null, 0x0E, null, 0x1E, null, null, null, null, null, null, null, null, null, null, null],
        'BCC': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x90, null, null, null, null],
        'BCS': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xB0, null, null, null, null],
        'BEQ': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF0, null, null, null, null],
        'BIT': [null, null, null, null, 0x89, null, 0x24, 0x34, null, null, null, null, null, null, 0x2C, null, 0x3C, null, null, null, null, null, null, null, null, null, null, null],
        'BMI': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x30, null, null, null, null],
        'BNE': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xD0, null, null, null, null],
        'BPL': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x10, null, null, null, null],
        'BRA': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x80, null, null, null, null],
        'BRK': [null, null, null, 0x00, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'BRL': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x82, null, null, null],
        'BVC': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x50, null, null, null, null],
        'BVS': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x70, null, null, null, null],
        'CLC': [0x18, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'CLD': [0xD8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'CLI': [0x58, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'CLV': [0xB8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'CMP': [null, null, null, null, 0xC9, null, 0xC5, 0xD5, null, 0xD2, 0xC1, 0xD1, 0xC7, 0xD7, 0xCD, null, 0xDD, 0xD9, null, null, null, 0xCF, 0xDF, null, null, 0xC3, 0xD3, null],
        'COP': [null, null, null, 0x02, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'CPX': [null, null, null, null, null, 0xE0, 0xE4, null, null, null, null, null, null, null, 0xEC, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'CPY': [null, null, null, null, null, 0xC0, 0xC4, null, null, null, null, null, null, null, 0xCC, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'DEC': [null, 0x3A, null, null, null, null, 0xC6, 0xD6, null, null, null, null, null, null, 0xCE, null, 0xDE, null, null, null, null, null, null, null, null, null, null, null],
        'DEX': [0xCA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'DEY': [0x88, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'EOR': [null, null, null, null, 0x49, null, 0x45, 0x55, null, 0x52, 0x41, 0x51, 0x47, 0x57, 0x4D, null, 0x5D, 0x59, null, null, null, 0x4F, 0x5F, null, null, 0x43, 0x53, null],
        'INC': [null, 0x1A, null, null, null, null, 0xE6, 0xF6, null, null, null, null, null, null, 0xEE, null, 0xFE, null, null, null, null, null, null, null, null, null, null, null],
        'INX': [0xE8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'INY': [0xC8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'JML': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xDC, 0x5C, null, null, null, null, null, null],
        'JMP': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x4C, null, null, null, 0x6C, 0x7C, null, null, null, null, null, null, null, null],
        'JSL': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x22, null, null, null, null, null, null],
        'JSR': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x20, null, null, null, null, 0xFC, null, null, null, null, null, null, null, null],
        'LDA': [null, null, null, null, 0xA9, null, 0xA5, 0xB5, null, 0xB2, 0xA1, 0xB1, 0xA7, 0xB7, 0xAD, null, 0xBD, 0xB9, null, null, null, 0xAF, 0xBF, null, null, 0xA3, 0xB3, null],
        'LDX': [null, null, null, null, null, 0xA2, 0xA6, null, 0xB6, null, null, null, null, null, 0xAE, null, null, 0xBE, null, null, null, null, null, null, null, null, null, null],
        'LDY': [null, null, null, null, null, 0xA0, 0xA4, 0xB4, null, null, null, null, null, null, 0xAC, null, 0xBC, null, null, null, null, null, null, null, null, null, null, null],
        'LSR': [null, 0x4A, null, null, null, null, 0x46, 0x56, null, null, null, null, null, null, 0x4E, null, 0x5E, null, null, null, null, null, null, null, null, null, null, null],
        'MVN': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x54],
        'MVP': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x44],
        'NOP': [0xEA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'ORA': [null, null, null, null, 0x09, null, 0x05, 0x15, null, 0x12, 0x01, 0x11, 0x07, 0x17, 0x0D, null, 0x1D, 0x19, null, null, null, 0x0F, 0x1F, null, null, 0x03, 0x13, null],
        'PEA': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0xF4, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PEI': [null, null, null, null, null, null, null, null, null, 0xD4, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PER': [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x62, null, null, null],
        'PHA': [null, null, 0x48, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PHB': [null, null, 0x8B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PHD': [null, null, 0x0B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PHK': [null, null, 0x4B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PHP': [null, null, 0x08, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PHX': [null, null, 0xDA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PHY': [null, null, 0x5A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PLA': [null, null, 0x68, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PLB': [null, null, 0xAB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PLD': [null, null, 0x2B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PLP': [null, null, 0x28, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PLX': [null, null, 0xFA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'PLY': [null, null, 0x7A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'REP': [null, null, null, 0xC2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'ROL': [null, 0x2A, null, null, null, null, 0x26, 0x36, null, null, null, null, null, null, 0x2E, null, 0x3E, null, null, null, null, null, null, null, null, null, null, null],
        'ROR': [null, 0x6A, null, null, null, null, 0x66, 0x76, null, null, null, null, null, null, 0x6E, null, 0x7E, null, null, null, null, null, null, null, null, null, null, null],
        'RTI': [null, null, 0x40, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'RTL': [null, null, 0x6B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'RTS': [null, null, 0x60, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'SBC': [null, null, null, null, 0xE9, null, 0xE5, 0xF5, null, 0xF2, 0xE1, 0xF1, 0xE7, 0xF7, 0xED, null, 0xFD, 0xF9, null, null, null, 0xEF, 0xFF, null, null, 0xE3, 0xF3, null],
        'SEC': [0x38, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'SED': [0xF8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'SEI': [0x78, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'SEP': [null, null, null, 0xE2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'STA': [null, null, null, null, null, null, 0x85, 0x95, null, 0x92, 0x81, 0x91, 0x87, 0x97, 0x8D, null, 0x9D, 0x99, null, null, null, 0x8F, 0x9F, null, null, 0x83, 0x93, null],
        'STP': [0xDB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'STX': [null, null, null, null, null, null, 0x86, null, 0x96, null, null, null, null, null, 0x8E, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'STY': [null, null, null, null, null, null, 0x84, 0x94, null, null, null, null, null, null, 0x8C, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'STZ': [null, null, null, null, null, null, 0x64, 0x74, null, null, null, null, null, null, 0x9C, null, 0x9E, null, null, null, null, null, null, null, null, null, null, null],
        'TAX': [0xAA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TAY': [0xA8, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TCD': [0x5B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TCS': [0x1B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TDC': [0x7B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TRB': [null, null, null, null, null, null, 0x14, null, null, null, null, null, null, null, 0x1C, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TSB': [null, null, null, null, null, null, 0x04, null, null, null, null, null, null, null, 0x0C, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TSC': [0x3B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TSX': [0xBA, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TXA': [0x8A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TXS': [0x9A, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TXY': [0x9B, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TYA': [0x98, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'TYX': [0xBB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'WAI': [0xCB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'WDM': [null, null, null, 0x42, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'XBA': [0xEB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        'XCE': [0xFB, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    };
    function GetInstructionLength(addressing, flagM, flagX) {
        let additionalLength = 0;
        switch (addressing) {
            case Addressing.ImmediateMemory:
                additionalLength = (flagM) ? 0 : 1;
                break;
            case Addressing.ImmediateIndex:
                additionalLength = (flagX) ? 0 : 1;
                break;
        }
        return InstructionLength[addressing] + additionalLength;
    }
    Emulator.GetInstructionLength = GetInstructionLength;
    class StepLog {
        constructor() {
            this.Instruction = Instruction.NOP;
            this.Addressing = Addressing.Implied;
            this.Opcode = Emulator.InstructionTable[Emulator.Instruction[this.Instruction]][this.Addressing];
            this.Operand1 = 0;
            this.Operand2 = 0;
            this.InstructionAddress = 0;
            this.IndirectAddress = 0;
            this.EffectiveAddress = 0;
            this.EffectiveValue = 0;
            this.MasterCycle = 0;
            this.CpuCycle = 0;
            this.InstructionLength = 0;
            this.Registers = new Registers();
            this.AccessLog = [];
            this.Source = null;
        }
        GetInstructionLogString() {
            let operand = this.GetFormattedOperand();
            const noteIndex = operand.indexOf('@');
            if (noteIndex >= 0) {
                operand = operand.substring(0, noteIndex);
            }
            return `${Instruction[this.Instruction]} ${operand.trim()}`;
        }
        GetLogString() {
            return `${Instruction[this.Instruction]} `
                + `${Utility.Format.PadSpace(this.GetFormattedOperand(), 40)}`
                + ` ; ${this.Registers.ToString()},C-CYC=${this.CpuCycle},M-CYC=${this.MasterCycle}`;
        }
        GetFormattedOperand() {
            const strOpr1M = this.Registers.GetRegisterStringA(this.Operand1);
            const strOpr1X = this.Registers.GetRegisterStringX(this.Operand1);
            const strOpr1B = Utility.Format.ToHexString(this.Operand1, 2);
            const strOpr1W = Utility.Format.ToHexString(this.Operand1, 4);
            const strOpr1L = Utility.Format.ToHexString(this.Operand1, 6);
            const strOpr2B = Utility.Format.ToHexString(this.Operand2, 2);
            const strIndAddr = Utility.Format.ToHexString(this.IndirectAddress, 6);
            const strEffAddr = Utility.Format.ToHexString(this.EffectiveAddress, 6);
            const strEffValM = this.Registers.GetRegisterStringA(this.EffectiveValue);
            const strEffValB = Utility.Format.ToHexString(this.EffectiveValue);
            const strLngAccess = `$${strEffAddr} => $${strEffValM}`;
            const strIndAccess = `$${strIndAddr} > $${strEffAddr} => $${strEffValM}`;
            const strOprRel = Utility.Format.SignChar(this.Operand1) + Math.abs(this.Operand1).toString();
            const strRelDst = Utility.Format.ToHexString(this.EffectiveAddress, 4);
            const strXycDst = '$' + strOpr1B + Utility.Format.ToHexString(this.Registers.Y, 4);
            const strXycSrc = '$' + strOpr2B + Utility.Format.ToHexString(this.Registers.X, 4);
            return [
                ``,
                `A`,
                ``,
                `#$${strOpr1B}`,
                `#$${strOpr1M}`,
                `#$${strOpr1X}`,
                `$${strOpr1B} @ ${strLngAccess}`,
                `$${strOpr1B}, X @ ${strLngAccess}`,
                `$${strOpr1B}, Y @ ${strLngAccess}`,
                `($${strOpr1B}) @ ${strIndAccess}`,
                `($${strOpr1B}, X) @ ${strIndAccess}`,
                `($${strOpr1B}), Y @ ${strIndAccess}`,
                `[$${strOpr1B}] @ ${strIndAccess}`,
                `[$${strOpr1B}], Y @ ${strIndAccess}`,
                `$${strOpr1W} @ ${strLngAccess}`,
                `$${strOpr1W}`,
                `$${strOpr1W}, X @ ${strLngAccess}`,
                `$${strOpr1W}, Y @ ${strLngAccess}`,
                `($${strOpr1W}) @ ${strIndAccess}`,
                `($${strOpr1W}, X) @ ${strIndAccess}`,
                `[$${strOpr1W}] @ ${strIndAccess}`,
                `$${strOpr1L}`,
                `$${strOpr1L}, X @ ${strLngAccess}`,
                `$${strRelDst} @ ${strOprRel}`,
                `$${strRelDst} @ ${strOprRel}`,
                `$${strOpr1B}, S @ ${strLngAccess}`,
                `($${strOpr1B}, S), Y @ ${strIndAccess}`,
                `$${strOpr2B}, $${strOpr1B} @ ${strXycDst} <- ${strXycSrc} => ${strEffValB}`,
            ][this.Addressing];
        }
        GetExecuteMasterCycle() {
            let cycle = 0;
            for (let i = 0; i < this.AccessLog.length; i++) {
                cycle += this.AccessLog[i].Cycle;
            }
            return cycle;
        }
        GetExecuteCpuCycle() {
            return this.AccessLog.length;
        }
        static AccessLogToString(log) {
            return `[${Utility.Format.PadSpace(AccessType[log.Type], 12)}]`
                + ` $${Utility.Format.ToHexString(log.AddressBus, 6)} = $${Utility.Format.ToHexString(log.DataBus, 2)}`
                + ` @ ${AccessSpeed[log.Cycle]}`;
        }
    }
    Emulator.StepLog = StepLog;
    let AccessType;
    (function (AccessType) {
        AccessType[AccessType["FetchOpcode"] = 0] = "FetchOpcode";
        AccessType[AccessType["FetchOperand"] = 1] = "FetchOperand";
        AccessType[AccessType["ReadIndirect"] = 2] = "ReadIndirect";
        AccessType[AccessType["Read"] = 3] = "Read";
        AccessType[AccessType["Write"] = 4] = "Write";
        AccessType[AccessType["ReadDummy"] = 5] = "ReadDummy";
        AccessType[AccessType["WriteDummy"] = 6] = "WriteDummy";
        AccessType[AccessType["PullStack"] = 7] = "PullStack";
        AccessType[AccessType["PushStack"] = 8] = "PushStack";
        AccessType[AccessType["Penalty"] = 9] = "Penalty";
    })(AccessType = Emulator.AccessType || (Emulator.AccessType = {}));
    let AccessSpeed;
    (function (AccessSpeed) {
        AccessSpeed[AccessSpeed["Fast"] = 6] = "Fast";
        AccessSpeed[AccessSpeed["Slow"] = 8] = "Slow";
        AccessSpeed[AccessSpeed["XSlow"] = 12] = "XSlow";
    })(AccessSpeed = Emulator.AccessSpeed || (Emulator.AccessSpeed = {}));
    const MinimumMasterCycle = 2;
    let RomMapping;
    (function (RomMapping) {
        RomMapping[RomMapping["LoROM"] = 0] = "LoROM";
        RomMapping[RomMapping["HiROM"] = 1] = "HiROM";
    })(RomMapping = Emulator.RomMapping || (Emulator.RomMapping = {}));
    let AccessRegion;
    (function (AccessRegion) {
        AccessRegion[AccessRegion["ROM"] = 0] = "ROM";
        AccessRegion[AccessRegion["MainRAM"] = 1] = "MainRAM";
        AccessRegion[AccessRegion["StaticRAM"] = 2] = "StaticRAM";
        AccessRegion[AccessRegion["IO"] = 3] = "IO";
        AccessRegion[AccessRegion["OpenBus"] = 4] = "OpenBus";
    })(AccessRegion = Emulator.AccessRegion || (Emulator.AccessRegion = {}));
    let InterruptType;
    (function (InterruptType) {
        InterruptType[InterruptType["NativeReserved0"] = 65504] = "NativeReserved0";
        InterruptType[InterruptType["NativeReserved2"] = 65506] = "NativeReserved2";
        InterruptType[InterruptType["NativeCOP"] = 65508] = "NativeCOP";
        InterruptType[InterruptType["NativeBRK"] = 65510] = "NativeBRK";
        InterruptType[InterruptType["NativeABT"] = 65512] = "NativeABT";
        InterruptType[InterruptType["NativeNMI"] = 65514] = "NativeNMI";
        InterruptType[InterruptType["NativeReservedC"] = 65516] = "NativeReservedC";
        InterruptType[InterruptType["NativeIRQ"] = 65518] = "NativeIRQ";
        InterruptType[InterruptType["EmulationReserved0"] = 65520] = "EmulationReserved0";
        InterruptType[InterruptType["EmulationReserved2"] = 65522] = "EmulationReserved2";
        InterruptType[InterruptType["EmulationCOP"] = 65524] = "EmulationCOP";
        InterruptType[InterruptType["EmulationReserved6"] = 65526] = "EmulationReserved6";
        InterruptType[InterruptType["EmulationABT"] = 65528] = "EmulationABT";
        InterruptType[InterruptType["EmulationNMI"] = 65530] = "EmulationNMI";
        InterruptType[InterruptType["EmulationRST"] = 65532] = "EmulationRST";
        InterruptType[InterruptType["EmulationIRQ"] = 65534] = "EmulationIRQ";
    })(InterruptType || (InterruptType = {}));
})(Emulator || (Emulator = {}));
var Assembler;
(function (Assembler_1) {
    class Assembler {
        constructor() {
            this.Chunks = [];
            this.Tokens = [];
            this.LabelList = {};
            this.PlusLabelList = [];
            this.MinusLabelList = [];
            this.DefineList = {};
            this.NowScopeName = '';
            this.NowAddress = 0;
            this.NowDirectPage = 0;
            this.NowMemoryLength = true;
            this.NowIndexLength = true;
            this.ErrorMessages = [];
            this.StartAddress = 0x008000;
        }
        static Assemble(code, startAddress = 0x008000) {
            const lex = new Assembler();
            lex.StartAddress = startAddress;
            const sectionLog = (str) => {
                console.log('%c' + (`----- ${str} ` + '-'.repeat(50)).substring(0, 50), 'background-color: silver');
            };
            const passStart = (pass) => {
                if (Assembler.Verbose) {
                    sectionLog(`Pass ${pass}`);
                }
                lex.ResetLexicalStatus();
            };
            const passFinish = () => {
                if (Assembler.Verbose) {
                    lex.DumpTokens();
                }
            };
            const dumpChunk = () => {
                if (Assembler.Verbose) {
                    sectionLog(`Assembled`);
                    lex.DumpChunks();
                }
            };
            const dumpError = () => {
                if (Assembler.Verbose) {
                    sectionLog(`Error`);
                    const consoleErrorLog = (message) => {
                        console.log('%c' + message, 'color: red');
                    };
                    lex.DumpErrors(consoleErrorLog);
                }
            };
            passStart(1);
            if (!lex.SplitTokens(code)) {
                dumpError();
                return [null, lex.ErrorMessages];
            }
            passFinish();
            passStart(2);
            if (!lex.ConfirmAddress()) {
                dumpError();
                return [null, lex.ErrorMessages];
            }
            passFinish();
            passStart(3);
            if (!lex.GenerateBinary()) {
                dumpError();
                return [null, lex.ErrorMessages];
            }
            passFinish();
            dumpChunk();
            return [lex.Chunks, lex.ErrorMessages];
        }
        ResetLexicalStatus() {
            this.NowScopeName = '';
            this.NowAddress = this.StartAddress;
            this.NowDirectPage = 0;
            this.NowMemoryLength = true;
            this.NowIndexLength = true;
        }
        SplitTokens(code, file = 'input.asm') {
            code = code.replace('\r\n', '\n');
            code = code.replace('\r', '\n');
            const lines = code.split('\n');
            let lineNumber = 0;
            const pushToken = (tokenType, options) => {
                this.Tokens.push({
                    TokenType: tokenType,
                    SourceInformation: new SourceMapping(file, lineNumber + 1, lines[lineNumber]),
                    Address: 0,
                    Options: options,
                });
            };
            const pushError = (message) => {
                this.ErrorMessages.push({
                    SourceInformation: new SourceMapping(file, lineNumber + 1, lines[lineNumber]),
                    Message: message,
                });
            };
            for (lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                let line = lines[lineNumber];
                const normalizedLine = Assembler.NormalizeString(line);
                if (normalizedLine === null) {
                    pushError('Encountered an unclosed string.');
                    continue;
                }
                let remain = normalizedLine;
                while (remain.length > 0) {
                    let checkRemain = null;
                    if ((checkRemain = this.CheckDirective(remain, pushToken, pushError)) !== null) {
                        remain = checkRemain.trim();
                        continue;
                    }
                    if ((checkRemain = this.CheckLabel(remain, pushToken, pushError)) !== null) {
                        remain = checkRemain.trim();
                        continue;
                    }
                    if ((checkRemain = this.CheckInstruction(remain, pushToken, pushError)) !== null) {
                        remain = checkRemain.trim();
                        continue;
                    }
                    if ((checkRemain = this.CheckDefine(remain, pushToken, pushError)) !== null) {
                        remain = checkRemain.trim();
                        continue;
                    }
                    pushError('Detected unknown token.');
                    break;
                }
            }
            return this.ErrorMessages.length <= 0;
        }
        CheckDirective(line, pushToken, pushError) {
            let directive = '';
            let remain = '';
            let param = '';
            let params = [];
            [directive, remain] = Assembler.SplitOnce(line);
            const pushDataArray = (tokenType) => {
                const splits = Assembler.SplitAll(remain, [','], false);
                pushToken(tokenType, splits);
                remain = '';
            };
            switch (directive) {
                case '.org': {
                    [param, remain] = Assembler.SplitOnce(remain);
                    if (param.length <= 0) {
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
                case '.dp': {
                    [param, remain] = Assembler.SplitOnce(remain);
                    if (param.length <= 0) {
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
        CheckLabel(line, pushToken, pushError) {
            const [word, remain] = Assembler.SplitOnce(line);
            const match = line.match(/^([^\s]+):\s*(.*)/);
            if (line.match(/^.[^\s=,]+\s*=/)) {
                return null;
            }
            if (match) {
                const globalLabel = match[1];
                const remain = match[2];
                if (globalLabel.match(/[\+\-*/%<>\|\^#$\.]/)) {
                    pushError(`Invalid label name. "${globalLabel}"`);
                    return '';
                }
                else if (this.LabelList[globalLabel]) {
                    pushError(`Global label name conflict. "${globalLabel}"`);
                    return '';
                }
                else if (this.DefineList[globalLabel]) {
                    pushError(`Global label name conflict. "${globalLabel}"`);
                    return '';
                }
                const scope = new ScopeItem();
                this.LabelList[globalLabel] = scope;
                this.NowScopeName = globalLabel;
                pushToken(CodeTokenType.LabelGlobal, [globalLabel]);
                return remain;
            }
            else if (word[0] === '.') {
                const localLabel = word;
                if (localLabel.match(/[\+\-*/%<>\|\^#$]/)) {
                    pushError(`Invalid label name. "${localLabel}"`);
                    return '';
                }
                else if ((!this.NowScopeName) || (!this.LabelList[this.NowScopeName])) {
                    pushError(`Local label used in global scope. "${localLabel}"`);
                    return '';
                }
                else if (this.LabelList[this.NowScopeName].LocalScope[localLabel]) {
                    pushError(`Local label name conflict. "${this.NowScopeName}" > "${localLabel}"`);
                    return '';
                }
                else if (this.LabelList[this.NowScopeName].LocalDefine[localLabel]) {
                    pushError(`Local label name conflict. "${this.NowScopeName}" > "${localLabel}"`);
                    return '';
                }
                const label = new LocalScopeItem();
                this.LabelList[this.NowScopeName].LocalScope[localLabel] = label;
                pushToken(CodeTokenType.LabelLocal, [localLabel]);
                return remain;
            }
            else if (word === '+') {
                pushToken(CodeTokenType.LabelPlus, []);
                return remain;
            }
            else if (word === '-') {
                pushToken(CodeTokenType.LabelMinus, []);
                return remain;
            }
            return null;
        }
        CheckInstruction(line, pushToken, pushError) {
            var _a;
            const instructionMatch = line.match(/^([A-Z]+)(\.\s*([bwl]))?\s*(.*)/i);
            if (!instructionMatch) {
                return null;
            }
            const instructionName = instructionMatch[1].toUpperCase();
            const instructionLength = ((_a = instructionMatch[3]) !== null && _a !== void 0 ? _a : '').toLowerCase();
            let remain = instructionMatch[4];
            const instruction = Assembler.StringToInstruction(instructionName);
            if (instruction === null) {
                return null;
            }
            let addressingLength = AddressingLength.None;
            switch (instructionLength) {
                case 'b':
                    addressingLength = AddressingLength.Byte;
                    break;
                case 'w':
                    addressingLength = AddressingLength.Word;
                    break;
                case 'l':
                    addressingLength = AddressingLength.Long;
                    break;
            }
            for (let i = 0; i < Assembler.InstructionPatternList.length; i++) {
                const instructionPattern = Assembler.InstructionPatternList[i];
                const pattern = instructionPattern.Pattern + '\s*(.*)';
                const operandMatch = remain.match(pattern);
                if (!operandMatch) {
                    continue;
                }
                const opcode = Emulator.InstructionTable[instructionName][instructionPattern.Addressing];
                if (opcode != null) {
                    const remainIndex = (operandMatch.length <= 4) ? 3 : 4;
                    remain = operandMatch[remainIndex];
                    const operand1 = operandMatch[2].trim();
                    const operand2 = operandMatch[3].trim();
                    const instructionToken = new InstructionToken(instruction, instructionPattern.Addressing, addressingLength, operand1, operand2);
                    pushToken(CodeTokenType.Instruction, [instructionToken]);
                    return remain;
                }
                else if (!instructionPattern.Fallback) {
                    pushError('This addressing can not be used with this instruction.');
                    return '';
                }
            }
            return null;
        }
        CheckDefine(line, pushToken, pushError) {
            const defineMatch = line.match(/([^\s=,]+)\s*=\s*([^=,]+)(.*)/);
            if (!defineMatch) {
                return null;
            }
            const defineName = defineMatch[1];
            const defineValue = defineMatch[2];
            const remain = defineMatch[3];
            if (defineName.match(/[+\-*/<>\(\)\[\]\{\}\"#$%&\'\|^]/)) {
                pushError(`Invalid define name. "${defineName}"`);
                return '';
            }
            if (defineName[0] !== '.') {
                if (this.DefineList[defineName]) {
                    pushError(`Define name conflict. "${defineName}"`);
                    return '';
                }
                if (this.LabelList[defineName]) {
                    pushError(`Define name conflict. "${defineName}"`);
                    return '';
                }
                const define = new DefineItem();
                define.DefinedScope = this.NowScopeName;
                define.Value = defineValue;
                this.DefineList[defineName] = define;
                pushToken(CodeTokenType.Define, [defineName]);
            }
            else {
                if ((!this.NowScopeName) || (!this.LabelList[this.NowScopeName])) {
                    pushError(`Local define used in global scope. "${defineName}"`);
                    return '';
                }
                else if (this.LabelList[this.NowScopeName].LocalDefine[defineName]) {
                    pushError(`Local define name conflict. "${this.NowScopeName}" > "${defineName}"`);
                    return '';
                }
                else if (this.LabelList[this.NowScopeName].LocalScope[defineName]) {
                    pushError(`Local define name conflict. "${this.NowScopeName}" > "${defineName}"`);
                    return '';
                }
                const define = new DefineItem();
                define.DefinedScope = this.NowScopeName;
                define.Value = defineValue;
                this.LabelList[this.NowScopeName].LocalDefine[defineName] = define;
                pushToken(CodeTokenType.DefineLocal, [defineName]);
            }
            return remain;
        }
        ConfirmAddress() {
            let token;
            const pushError = (message) => {
                this.ErrorMessages.push({
                    SourceInformation: token.SourceInformation,
                    Message: message,
                });
            };
            const pushTypeError = () => {
                pushError('Type mismatch.');
            };
            const resolve = (name) => {
                if ((typeof (name) !== 'string') && (typeof (name) !== 'number')) {
                    pushTypeError();
                    return null;
                }
                const [value, message] = this.ResolveValue(name);
                if (value !== null) {
                    return value;
                }
                else {
                    pushError(message);
                    return null;
                }
            };
            for (let i = 0; i < this.Tokens.length; i++) {
                token = this.Tokens[i];
                token.Address = this.NowAddress;
                switch (token.TokenType) {
                    case CodeTokenType.DirectiveOrigin: {
                        const value = resolve(token.Options[0]);
                        if (value === null) {
                            break;
                        }
                        this.NowAddress = value;
                        token.Address = value;
                        token.Options[0] = value;
                        break;
                    }
                    case CodeTokenType.DirectiveDataByte:
                        this.NowAddress += this.GetDataBytes(token, 1, false, pushError).length;
                        break;
                    case CodeTokenType.DirectiveDataWord:
                        this.NowAddress += this.GetDataBytes(token, 2, false, pushError).length;
                        break;
                    case CodeTokenType.DirectiveDataLong:
                        this.NowAddress += this.GetDataBytes(token, 3, false, pushError).length;
                        break;
                    case CodeTokenType.DirectiveDataDouble:
                        this.NowAddress += this.GetDataBytes(token, 4, false, pushError).length;
                        break;
                    case CodeTokenType.DirectiveMemoryShort:
                        this.NowMemoryLength = true;
                        break;
                    case CodeTokenType.DirectiveMemoryLong:
                        this.NowMemoryLength = false;
                        break;
                    case CodeTokenType.DirectiveIndexShort:
                        this.NowIndexLength = true;
                        break;
                    case CodeTokenType.DirectiveIndexLong:
                        this.NowIndexLength = false;
                        break;
                    case CodeTokenType.DirectiveDirectPointer: {
                        const value = resolve(token.Options[0]);
                        if (value === null) {
                            break;
                        }
                        this.NowDirectPage = value;
                        token.Options[0] = value;
                        break;
                    }
                    case CodeTokenType.LabelGlobal: {
                        const name = token.Options[0];
                        if (typeof (name) !== 'string') {
                            pushTypeError();
                            break;
                        }
                        this.NowScopeName = name;
                        this.LabelList[name].Address = this.NowAddress;
                        break;
                    }
                    case CodeTokenType.LabelLocal:
                        const name = token.Options[0];
                        if (typeof (name) !== 'string') {
                            pushTypeError();
                            break;
                        }
                        this.LabelList[this.NowScopeName].LocalScope[name].Address = this.NowAddress;
                        break;
                    case CodeTokenType.LabelPlus:
                        this.PlusLabelList.push(this.NowAddress);
                        break;
                    case CodeTokenType.LabelMinus:
                        this.MinusLabelList.push(this.NowAddress);
                        break;
                    case CodeTokenType.Instruction:
                        const instruction = token.Options[0];
                        if (!(instruction instanceof InstructionToken)) {
                            pushTypeError();
                            break;
                        }
                        const length = this.DetermineInstructionAddress(instruction, pushError);
                        if (length <= 0) {
                            pushError('Invalid addressing.');
                        }
                        this.NowAddress += length;
                        break;
                    case CodeTokenType.Define: {
                        const name = token.Options[0];
                        if (typeof (name) !== 'string') {
                            pushTypeError();
                            break;
                        }
                        this.DefineList[name].DefinedAddress = this.NowAddress;
                        break;
                    }
                    case CodeTokenType.DefineLocal: {
                        const name = token.Options[0];
                        if (typeof (name) !== 'string') {
                            pushTypeError();
                            break;
                        }
                        this.LabelList[this.NowScopeName].LocalDefine[name].DefinedAddress = this.NowAddress;
                        break;
                    }
                }
            }
            this.PlusLabelList.sort();
            this.MinusLabelList.sort();
            return this.ErrorMessages.length <= 0;
        }
        DetermineInstructionAddress(instruction, pushError) {
            let flagM = this.NowMemoryLength;
            let flagX = this.NowIndexLength;
            let valid = true;
            switch (instruction.Addressing) {
                case Emulator.Addressing.Implied:
                case Emulator.Addressing.Accumulator:
                case Emulator.Addressing.Stack:
                case Emulator.Addressing.Immediate8:
                case Emulator.Addressing.DirectpageIndirect:
                case Emulator.Addressing.DirectpageIndexedIndirectX:
                case Emulator.Addressing.DirectpageIndirectIndexedY:
                case Emulator.Addressing.DirectpageIndirectLong:
                case Emulator.Addressing.DirectpageIndirectLongIndexedY:
                case Emulator.Addressing.AbsoluteIndirect:
                case Emulator.Addressing.AbsoluteIndexedIndirect:
                case Emulator.Addressing.AbsoluteIndirectLong:
                case Emulator.Addressing.Relative:
                case Emulator.Addressing.RelativeLong:
                case Emulator.Addressing.StackRelative:
                case Emulator.Addressing.StackRelativeIndirectIndexedY:
                case Emulator.Addressing.BlockMove:
                    break;
                case Emulator.Addressing.ImmediateMemory:
                    switch (instruction.AddressingLength) {
                        case AddressingLength.Byte:
                            flagM = true;
                            break;
                        case AddressingLength.Word:
                            flagM = false;
                            break;
                        case AddressingLength.Long:
                            return -1;
                    }
                    break;
                case Emulator.Addressing.ImmediateIndex:
                    switch (instruction.AddressingLength) {
                        case AddressingLength.Byte:
                            flagX = true;
                            break;
                        case AddressingLength.Word:
                            flagX = false;
                            break;
                        case AddressingLength.Long:
                            return -1;
                    }
                    break;
                case Emulator.Addressing.Directpage:
                case Emulator.Addressing.Absolute:
                case Emulator.Addressing.AbsoluteJump:
                case Emulator.Addressing.AbsoluteLong:
                    valid = this.DetermineInstructionAddressing(instruction, Emulator.Addressing.Directpage, Emulator.Addressing.Absolute, Emulator.Addressing.AbsoluteLong);
                    break;
                case Emulator.Addressing.DirectpageIndexedX:
                case Emulator.Addressing.AbsoluteIndexedX:
                case Emulator.Addressing.AbsoluteLongIndexedX:
                    valid = this.DetermineInstructionAddressing(instruction, Emulator.Addressing.DirectpageIndexedX, Emulator.Addressing.AbsoluteIndexedX, Emulator.Addressing.AbsoluteLongIndexedX);
                    break;
                case Emulator.Addressing.DirectpageIndexedY:
                case Emulator.Addressing.AbsoluteIndexedY:
                    valid = this.DetermineInstructionAddressing(instruction, Emulator.Addressing.DirectpageIndexedY, Emulator.Addressing.AbsoluteIndexedY, null);
                    break;
            }
            if (!valid) {
                return -1;
            }
            return Emulator.GetInstructionLength(instruction.Addressing, flagM, flagX);
        }
        DetermineInstructionAddressing(instruction, addressingDp, addressingAbs, addressingLong) {
            const instructionTableEntry = Emulator.InstructionTable[Emulator.Instruction[instruction.Instruction]];
            let useAddressing = addressingAbs;
            if ((addressingLong !== null) &&
                ((instructionTableEntry[addressingDp] === null) && (instructionTableEntry[addressingAbs] === null) && (instructionTableEntry[addressingLong] !== null))) {
                instruction.AddressingLength = AddressingLength.Long;
            }
            switch (instruction.AddressingLength) {
                case AddressingLength.None: {
                    const [target, message] = this.ResolveValue(instruction.Operand1);
                    if (target === null) {
                        break;
                    }
                    const availableLong = (addressingLong !== null) && (instructionTableEntry[addressingLong] !== null);
                    if (availableLong && ((this.NowAddress & 0xFF0000) != (target & 0xFF0000))) {
                        useAddressing = addressingLong;
                        break;
                    }
                    const availableDp = (instructionTableEntry[addressingDp] !== null);
                    if (availableDp && (Utility.Math.IsRange((target & 0x00FFFF) - this.NowDirectPage, 0, 0x100))) {
                        useAddressing = addressingDp;
                        break;
                    }
                    break;
                }
                case AddressingLength.Byte:
                    useAddressing = addressingDp;
                    break;
                case AddressingLength.Word:
                    useAddressing = addressingAbs;
                    break;
                case AddressingLength.Long:
                    if (addressingLong === null) {
                        return false;
                    }
                    useAddressing = addressingLong;
                    break;
            }
            if (instructionTableEntry[useAddressing] !== null) {
                instruction.Addressing = useAddressing;
                return true;
            }
            else {
                return false;
            }
        }
        GenerateBinary() {
            let token;
            let chunk = new DataChunk();
            chunk.Address = this.NowAddress;
            const pushError = (message) => {
                this.ErrorMessages.push({
                    SourceInformation: token.SourceInformation,
                    Message: message,
                });
            };
            const pushTypeError = () => {
                pushError('Type mismatch.');
            };
            const resolve = (name) => {
                if ((typeof (name) !== 'string') && (typeof (name) !== 'number')) {
                    pushTypeError();
                    return null;
                }
                const [value, message] = this.ResolveValue(name);
                if (value !== null) {
                    return value;
                }
                else {
                    pushError(message);
                    return null;
                }
            };
            for (let i = 0; i < this.Tokens.length; i++) {
                token = this.Tokens[i];
                this.NowAddress = token.Address;
                const beforeChunkLength = chunk.Data.length;
                switch (token.TokenType) {
                    case CodeTokenType.DirectiveOrigin: {
                        if (chunk.Data.length > 0) {
                            this.Chunks.push(chunk);
                        }
                        chunk = new DataChunk();
                        chunk.Address = token.Address;
                        break;
                    }
                    case CodeTokenType.DirectiveDataByte: {
                        const data = this.GetDataBytes(token, 1, true, pushError);
                        chunk.Data = chunk.Data.concat(data);
                        break;
                    }
                    case CodeTokenType.DirectiveDataWord: {
                        const data = this.GetDataBytes(token, 2, true, pushError);
                        chunk.Data = chunk.Data.concat(data);
                        break;
                    }
                    case CodeTokenType.DirectiveDataLong: {
                        const data = this.GetDataBytes(token, 3, true, pushError);
                        chunk.Data = chunk.Data.concat(data);
                        break;
                    }
                    case CodeTokenType.DirectiveDataDouble: {
                        const data = this.GetDataBytes(token, 4, true, pushError);
                        chunk.Data = chunk.Data.concat(data);
                        break;
                    }
                    case CodeTokenType.DirectiveMemoryShort:
                        this.NowMemoryLength = true;
                        break;
                    case CodeTokenType.DirectiveMemoryLong:
                        this.NowMemoryLength = false;
                        break;
                    case CodeTokenType.DirectiveIndexShort:
                        this.NowIndexLength = true;
                        break;
                    case CodeTokenType.DirectiveIndexLong:
                        this.NowIndexLength = false;
                        break;
                    case CodeTokenType.DirectiveDirectPointer: {
                        const value = resolve(token.Options[0]);
                        if (value === null) {
                            break;
                        }
                        this.NowDirectPage = value;
                        break;
                    }
                    case CodeTokenType.LabelGlobal: {
                        const name = token.Options[0];
                        if (typeof (name) !== 'string') {
                            pushTypeError();
                            break;
                        }
                        this.NowScopeName = name;
                        break;
                    }
                    case CodeTokenType.LabelLocal:
                    case CodeTokenType.LabelPlus:
                    case CodeTokenType.LabelMinus:
                        break;
                    case CodeTokenType.Instruction:
                        const instruction = token.Options[0];
                        if (!(instruction instanceof InstructionToken)) {
                            pushTypeError();
                            break;
                        }
                        this.PushInstructionBinary(chunk, instruction, pushError);
                        break;
                    case CodeTokenType.Define:
                    case CodeTokenType.DefineLocal:
                        break;
                }
                const addChunkLength = chunk.Data.length - beforeChunkLength;
                for (let i = 0; i < addChunkLength; i++) {
                    chunk.Source.push(token.SourceInformation);
                }
            }
            if (chunk.Data.length > 0) {
                this.Chunks.push(chunk);
            }
            return this.ErrorMessages.length <= 0;
        }
        PushInstructionBinary(chunk, instruction, pushError) {
            const instructionEntry = Emulator.InstructionTable[Emulator.Instruction[instruction.Instruction]];
            if (instructionEntry === null) {
                pushError('Invalid instruction.');
                return;
            }
            const instructionByte = instructionEntry[instruction.Addressing];
            if (instructionByte === null) {
                pushError('Invalid instruction addressing.');
                return;
            }
            const pushByte = (value) => {
                value = Utility.Type.ToByte(value);
                chunk.Data.push(value & 0xFF);
            };
            const pushWord = (value) => {
                value = Utility.Type.ToWord(value);
                chunk.Data.push(value & 0xFF);
                chunk.Data.push((value >> 8) & 0xFF);
            };
            const pushLong = (value) => {
                value = Utility.Type.ToLong(value);
                chunk.Data.push(value & 0xFF);
                chunk.Data.push((value >> 8) & 0xFF);
                chunk.Data.push((value >> 16) & 0xFF);
            };
            pushByte(instructionByte);
            switch (instruction.Addressing) {
                case Emulator.Addressing.Implied:
                case Emulator.Addressing.Accumulator:
                case Emulator.Addressing.Stack:
                    {
                        break;
                    }
                case Emulator.Addressing.Immediate8:
                case Emulator.Addressing.StackRelative:
                case Emulator.Addressing.StackRelativeIndirectIndexedY:
                    {
                        const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                        if (operand1 === null) {
                            pushError('Failed to resolve operand. ' + message1);
                            break;
                        }
                        pushByte(operand1);
                        break;
                    }
                case Emulator.Addressing.Directpage:
                case Emulator.Addressing.DirectpageIndexedX:
                case Emulator.Addressing.DirectpageIndexedY:
                case Emulator.Addressing.DirectpageIndirect:
                case Emulator.Addressing.DirectpageIndexedIndirectX:
                case Emulator.Addressing.DirectpageIndirectIndexedY:
                case Emulator.Addressing.DirectpageIndirectLong:
                case Emulator.Addressing.DirectpageIndirectLongIndexedY:
                    {
                        const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                        if (operand1 === null) {
                            pushError('Failed to resolve operand. ' + message1);
                            break;
                        }
                        const effective = (operand1 & 0x00FFFF) - this.NowDirectPage;
                        if ((instruction.AddressingLength === AddressingLength.Byte) || (Utility.Math.IsRange(effective, 0, 0x100))) {
                            pushByte(effective);
                        }
                        else {
                            pushError('Direct page out of bounds.');
                            break;
                        }
                        break;
                    }
                case Emulator.Addressing.ImmediateMemory: {
                    const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                    if (operand1 === null) {
                        pushError('Failed to resolve operand. ' + message1);
                        break;
                    }
                    const isByte = (instruction.AddressingLength === AddressingLength.Byte)
                        || ((instruction.AddressingLength === AddressingLength.None) && this.NowMemoryLength);
                    if (isByte) {
                        pushByte(operand1);
                    }
                    else {
                        pushWord(operand1);
                    }
                    break;
                }
                case Emulator.Addressing.ImmediateIndex: {
                    const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                    if (operand1 === null) {
                        pushError('Failed to resolve operand. ' + message1);
                        break;
                    }
                    const isByte = (instruction.AddressingLength === AddressingLength.Byte)
                        || ((instruction.AddressingLength === AddressingLength.None) && this.NowIndexLength);
                    if (isByte) {
                        pushByte(operand1);
                    }
                    else {
                        pushWord(operand1);
                    }
                    break;
                }
                case Emulator.Addressing.Absolute:
                case Emulator.Addressing.AbsoluteJump:
                case Emulator.Addressing.AbsoluteIndexedX:
                case Emulator.Addressing.AbsoluteIndexedY:
                case Emulator.Addressing.AbsoluteIndirect:
                case Emulator.Addressing.AbsoluteIndexedIndirect:
                case Emulator.Addressing.AbsoluteIndirectLong:
                    {
                        const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                        if (operand1 === null) {
                            pushError('Failed to resolve operand. ' + message1);
                            break;
                        }
                        pushWord(operand1);
                        break;
                    }
                case Emulator.Addressing.AbsoluteLong:
                case Emulator.Addressing.AbsoluteLongIndexedX:
                    {
                        const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                        if (operand1 === null) {
                            pushError('Failed to resolve operand. ' + message1);
                            break;
                        }
                        pushLong(operand1);
                        break;
                    }
                case Emulator.Addressing.Relative: {
                    const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                    if (operand1 === null) {
                        pushError('Failed to resolve operand. ' + message1);
                        break;
                    }
                    const nextAddress = this.NowAddress + 2;
                    const effective = operand1 - nextAddress;
                    if (Utility.Math.IsRange(effective, -0x80, 0x7F)) {
                        pushByte(effective);
                    }
                    else {
                        pushError('Relative address range exceeded.');
                        break;
                    }
                    break;
                }
                case Emulator.Addressing.RelativeLong: {
                    const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                    if (operand1 === null) {
                        pushError('Failed to resolve operand. ' + message1);
                        break;
                    }
                    const nextAddress = this.NowAddress + 3;
                    const effective = operand1 - nextAddress;
                    if (Utility.Math.IsRange(effective, -0x8000, 0x7FFF)) {
                        pushWord(effective);
                    }
                    else {
                        pushError('Relative address range exceeded.');
                        break;
                    }
                    break;
                }
                case Emulator.Addressing.BlockMove: {
                    const [operand1, message1] = this.ResolveValue(instruction.Operand1);
                    const [operand2, message2] = this.ResolveValue(instruction.Operand2);
                    const operand1Failed = operand1 === null;
                    const operand2Failed = operand2 === null;
                    if (operand1Failed || operand2Failed) {
                        if (operand1Failed) {
                            pushError('Failed to resolve operand. ' + message1);
                        }
                        if (operand2Failed) {
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
        static DecodeValue(str) {
            let match;
            let sign = 1;
            if (str[0] === '-') {
                sign = -1;
                str = str.substring(1);
            }
            match = str.match(/^\$([\dA-F]+)$/i);
            if (match) {
                const c = match[1];
                return parseInt(c, 16) * sign;
            }
            match = str.match(/^%([01_]+)$/i);
            if (match) {
                const c = match[1].replace('_', '');
                return parseInt(c, 2);
            }
            match = str.match(/^(\d+)$/i);
            if (match) {
                const c = match[1];
                return parseInt(c, 10);
            }
            return null;
        }
        ResolveValue(name, depth = 1, scope = null, nowAddress = null) {
            if (nowAddress === null) {
                nowAddress = this.NowAddress;
            }
            if (scope === null) {
                scope = this.NowScopeName;
            }
            if (typeof (name) === 'number') {
                return [name, ''];
            }
            depth++;
            if (depth > 100) {
                return [null, 'The definition is too deep.'];
            }
            if (this.DefineList[name]) {
                const define = this.DefineList[name];
                const [value, message] = this.ResolveValue(define.Value, depth, define.DefinedScope, define.DefinedAddress);
                if ((value !== null) && (value !== InvalidAddress)) {
                    return [value, 'define'];
                }
                else {
                    return [null, message];
                }
            }
            if (name === '+') {
                for (let i = 0; i < this.PlusLabelList.length; i++) {
                    if (nowAddress < this.PlusLabelList[i]) {
                        return [this.PlusLabelList[i], 'plus label'];
                    }
                }
                return [null, 'Plus label resolution failed.'];
            }
            if (name === '-') {
                for (let i = this.MinusLabelList.length - 1; i >= 0; i--) {
                    if (this.MinusLabelList[i] <= nowAddress) {
                        return [this.MinusLabelList[i], 'minus label'];
                    }
                }
                return [null, 'Minus label resolution failed.'];
            }
            const matchExpression = name.match(/^([^\s*/%<>&\|\^][^\s\+\-*/%<>&\|\^]*)\s*([\+\-*/%<>&\|\^]+)\s*(.*)$/);
            if (matchExpression) {
                const leftString = matchExpression[1];
                const operator = matchExpression[2];
                const rightString = matchExpression[3];
                const operatorFunction = Assembler.OperatorFunctions[operator];
                if (!operatorFunction) {
                    return [null, 'Invalid operator.'];
                }
                const [leftValue, leftMessage] = this.ResolveValue(leftString, depth, scope, nowAddress);
                const [rightValue, rightMessage] = this.ResolveValue(rightString, depth, scope, nowAddress);
                if ((leftValue === null) || (leftValue === InvalidAddress)) {
                    return [null, leftMessage];
                }
                if ((rightValue === null) || (rightValue === InvalidAddress)) {
                    return [null, rightMessage];
                }
                return [operatorFunction(leftValue, rightValue), 'expression'];
            }
            if (name[0] === '.') {
                if (!scope) {
                    return [null, 'Scope resolution failed.'];
                }
                const scopeLabel = this.LabelList[scope];
                if (!scopeLabel) {
                    return [null, 'Scope resolution failed.'];
                }
                const label = scopeLabel.LocalScope[name];
                const define = scopeLabel.LocalDefine[name];
                if (!label && !define) {
                    return [null, `Failed to resolve local label or define "${name}".`];
                }
                if (label) {
                    if (label.Address === InvalidAddress) {
                        return [null, 'Invalid address local label.'];
                    }
                    return [label.Address, 'local label'];
                }
                else {
                    const [value, message] = this.ResolveValue(define.Value, depth, define.DefinedScope, define.DefinedAddress);
                    if ((value !== null) && (value !== InvalidAddress)) {
                        return [value, 'local define'];
                    }
                    else {
                        return [null, message];
                    }
                }
            }
            if (this.LabelList[name]) {
                const label = this.LabelList[name];
                if (label.Address === InvalidAddress) {
                    return [null, 'Invalid address global label.'];
                }
                return [label.Address, 'global label'];
            }
            {
                const value = Assembler.DecodeValue(name);
                if (value !== null) {
                    return [value, 'number'];
                }
            }
            return [null, `Failed to resolve "${name}".`];
        }
        GetDataBytes(token, baseSize, strict, pushError) {
            const data = [];
            const pushValue = (value) => {
                for (let i = 0; i < baseSize; i++) {
                    const byte = value & 0xFF;
                    data.push(byte);
                    value >>= 8;
                }
            };
            for (let i = 0; i < token.Options.length; i++) {
                const option = token.Options[i];
                if (typeof (option) === 'number') {
                    pushValue(option);
                }
                else if (typeof (option) === 'string') {
                    if (option[0] === '"') {
                        for (let j = 1; j < (option.length - 1); j++) {
                            const char = option.codePointAt(j);
                            pushValue((char !== undefined) ? char : 0);
                        }
                    }
                    else {
                        const [resolved, message] = this.ResolveValue(option);
                        pushValue((resolved !== null) ? resolved : 0);
                        if ((resolved === null) && strict) {
                            pushError(message);
                        }
                    }
                }
                else {
                }
            }
            return data;
        }
        static NormalizeString(str) {
            const reader = new Utility.CharacterReadStream(str);
            let output = '';
            while (!reader.ReadEnd()) {
                const c = reader.Read();
                if (c == null) {
                    return null;
                }
                const prevChar = output[output.length - 1];
                const isSpace = c.trim().length <= 0;
                if (isSpace) {
                    if (prevChar !== ' ') {
                        output += ' ';
                        continue;
                    }
                    else {
                        continue;
                    }
                }
                if (c == ';') {
                    break;
                }
                if (c == '/') {
                    if (prevChar !== '/') {
                        output += c;
                        continue;
                    }
                    else {
                        output = output.substring(0, output.length - 1);
                        break;
                    }
                }
                output += c;
            }
            return output.trim();
        }
        static SplitOnce(str, splits = [' ']) {
            const reader = new Utility.CharacterReadStream(str);
            let left = '';
            let right = '';
            while (!reader.ReadEnd()) {
                const c = reader.Read();
                if (!c) {
                    break;
                }
                if (splits.includes(c)) {
                    break;
                }
                else {
                    left += c;
                }
            }
            right = reader.Remaining().trim();
            return [left, right];
        }
        static SplitAll(str, splits = [' '], skipBlank = false) {
            const reader = new Utility.CharacterReadStream(str);
            const list = [];
            let item = '';
            while (!reader.ReadEnd()) {
                const c = reader.Read();
                if (!c) {
                    break;
                }
                if (splits.includes(c)) {
                    const isPush = (!skipBlank) || (item.length > 0);
                    const space = (item.length <= 0) && (c === ' ');
                    if (isPush && !space) {
                        list.push(item.trim());
                    }
                    item = '';
                }
                else {
                    item += c;
                }
            }
            if ((!skipBlank) || (item.length > 0)) {
                list.push(item.trim());
            }
            return list;
        }
        static StringToInstruction(str) {
            let i = 0;
            while (Emulator.Instruction[i] !== undefined) {
                if (Emulator.Instruction[i] === str) {
                    return i;
                }
                i++;
            }
            return null;
        }
        static ConvertErrorStrings(errorMessages, newline = '\n') {
            const errorStrings = [];
            for (let i = 0; i < errorMessages.length; i++) {
                const m = errorMessages[i];
                errorStrings.push(`[${i}] Line:${m.SourceInformation.Line} ${m.Message}` + newline + m.SourceInformation.Source);
            }
            return errorStrings;
        }
        DumpTokens(print = console.log, newline = '\n') {
            for (let i = 0; i < this.Tokens.length; i++) {
                const t = this.Tokens[i];
                let l = `[${i}] Line:${t.SourceInformation.Line} $${Utility.Format.ToHexString(t.Address, 6)} ${CodeTokenType[t.TokenType]}: #${t.Options.length} ${t.Options}`;
                if (t.Options[0] instanceof InstructionToken) {
                    l += newline + t.Options[0].ToString();
                }
                print(l);
            }
        }
        DumpChunks(print = console.log, newline = '\n', columns = 16) {
            for (let i = 0; i < this.Chunks.length; i++) {
                const chunk = this.Chunks[i];
                let str = `[${i}] $${Utility.Format.ToHexString(chunk.Address, 6)} ${chunk.Data.length} byte(s)`;
                for (let j = 0; j < chunk.Data.length; j++) {
                    if ((j % columns) == 0) {
                        str += newline + `  $${Utility.Format.ToHexString(chunk.Address + j, 6)} :`;
                    }
                    str += ` ${Utility.Format.ToHexString(chunk.Data[j], 2)}`;
                }
                print(str);
            }
        }
        DumpErrors(print = console.log) {
            const errorStrings = Assembler.ConvertErrorStrings(this.ErrorMessages);
            for (let i = 0; i < errorStrings.length; i++) {
                print(errorStrings[i]);
            }
        }
    }
    Assembler.Verbose = false;
    Assembler.InstructionPatternList = [
        { Pattern: `^(([Aa]))`, Addressing: Emulator.Addressing.Accumulator, Fallback: false },
        { Pattern: `^(#(.+))`, Addressing: Emulator.Addressing.Immediate8, Fallback: true },
        { Pattern: `^(#(.+))`, Addressing: Emulator.Addressing.ImmediateMemory, Fallback: true },
        { Pattern: `^(#(.+))`, Addressing: Emulator.Addressing.ImmediateIndex, Fallback: false },
        { Pattern: `^(\\(\\s*([^,]+)\\s*,\\s*[Xx]\\s*\\))`, Addressing: Emulator.Addressing.DirectpageIndexedIndirectX, Fallback: true },
        { Pattern: `^(\\(\\s*([^,]+)\\s*,\\s*[Xx]\\s*\\))`, Addressing: Emulator.Addressing.AbsoluteIndexedIndirect, Fallback: false },
        { Pattern: `^(\\(\\s*([^,]+)\\s*,\\s*[Ss]\\s*\\)\\s*,\\s*[Yy])`, Addressing: Emulator.Addressing.StackRelativeIndirectIndexedY, Fallback: false },
        { Pattern: `^(\\(\\s*([^,]+)\\s*\\)\\s*,\\s*[Yy])`, Addressing: Emulator.Addressing.DirectpageIndirectIndexedY, Fallback: false },
        { Pattern: `^(\\[\\s*([^,]+)\\s*\\]\\s*,\\s*[Yy])`, Addressing: Emulator.Addressing.DirectpageIndirectLongIndexedY, Fallback: false },
        { Pattern: `^(\\(\\s*([^,]+)\\s*\\))`, Addressing: Emulator.Addressing.DirectpageIndirect, Fallback: true },
        { Pattern: `^(\\(\\s*([^,]+)\\s*\\))`, Addressing: Emulator.Addressing.AbsoluteIndirect, Fallback: false },
        { Pattern: `^(\\[\\s*([^,]+)\\s*\\])`, Addressing: Emulator.Addressing.AbsoluteIndirectLong, Fallback: true },
        { Pattern: `^(\\[\\s*([^,]+)\\s*\\])`, Addressing: Emulator.Addressing.DirectpageIndirectLong, Fallback: false },
        { Pattern: `^(([^,]+)\\s*,\\s*[Xx])`, Addressing: Emulator.Addressing.DirectpageIndexedX, Fallback: false },
        { Pattern: `^(([^,]+)\\s*,\\s*[Yy])`, Addressing: Emulator.Addressing.DirectpageIndexedY, Fallback: true },
        { Pattern: `^(([^,]+)\\s*,\\s*[Yy])`, Addressing: Emulator.Addressing.AbsoluteIndexedY, Fallback: false },
        { Pattern: `^(([^,]+)\\s*,\\s*[Ss])`, Addressing: Emulator.Addressing.StackRelative, Fallback: false },
        { Pattern: `^(([^,]+),\\s*([^,]+))`, Addressing: Emulator.Addressing.BlockMove, Fallback: false },
        { Pattern: `^(([^,]+))`, Addressing: Emulator.Addressing.Relative, Fallback: true },
        { Pattern: `^(([^,]+))`, Addressing: Emulator.Addressing.RelativeLong, Fallback: true },
        { Pattern: `^(([^,]+))`, Addressing: Emulator.Addressing.Directpage, Fallback: true },
        { Pattern: `^(([^,]+))`, Addressing: Emulator.Addressing.Absolute, Fallback: true },
        { Pattern: `^(([^,]+))`, Addressing: Emulator.Addressing.AbsoluteLong, Fallback: false },
        { Pattern: `^(())`, Addressing: Emulator.Addressing.Accumulator, Fallback: true },
        { Pattern: `^(())`, Addressing: Emulator.Addressing.Stack, Fallback: true },
        { Pattern: `^(())`, Addressing: Emulator.Addressing.Implied, Fallback: false },
    ];
    Assembler.OperatorFunctions = {
        '+': (a, b) => a + b,
        '-': (a, b) => a - b,
        '*': (a, b) => a * b,
        '/': (a, b) => a / b,
        '%': (a, b) => a % b,
        '<<': (a, b) => a << b,
        '>>': (a, b) => a >> b,
        '&': (a, b) => a & b,
        '|': (a, b) => a | b,
        '^': (a, b) => a ^ b,
    };
    Assembler_1.Assembler = Assembler;
    let CodeTokenType;
    (function (CodeTokenType) {
        CodeTokenType[CodeTokenType["Invalid"] = 0] = "Invalid";
        CodeTokenType[CodeTokenType["DirectiveOrigin"] = 1] = "DirectiveOrigin";
        CodeTokenType[CodeTokenType["DirectiveDataByte"] = 2] = "DirectiveDataByte";
        CodeTokenType[CodeTokenType["DirectiveDataWord"] = 3] = "DirectiveDataWord";
        CodeTokenType[CodeTokenType["DirectiveDataLong"] = 4] = "DirectiveDataLong";
        CodeTokenType[CodeTokenType["DirectiveDataDouble"] = 5] = "DirectiveDataDouble";
        CodeTokenType[CodeTokenType["DirectiveMemoryShort"] = 6] = "DirectiveMemoryShort";
        CodeTokenType[CodeTokenType["DirectiveMemoryLong"] = 7] = "DirectiveMemoryLong";
        CodeTokenType[CodeTokenType["DirectiveIndexShort"] = 8] = "DirectiveIndexShort";
        CodeTokenType[CodeTokenType["DirectiveIndexLong"] = 9] = "DirectiveIndexLong";
        CodeTokenType[CodeTokenType["DirectiveDirectPointer"] = 10] = "DirectiveDirectPointer";
        CodeTokenType[CodeTokenType["LabelGlobal"] = 11] = "LabelGlobal";
        CodeTokenType[CodeTokenType["LabelLocal"] = 12] = "LabelLocal";
        CodeTokenType[CodeTokenType["LabelPlus"] = 13] = "LabelPlus";
        CodeTokenType[CodeTokenType["LabelMinus"] = 14] = "LabelMinus";
        CodeTokenType[CodeTokenType["Instruction"] = 15] = "Instruction";
        CodeTokenType[CodeTokenType["Define"] = 16] = "Define";
        CodeTokenType[CodeTokenType["DefineLocal"] = 17] = "DefineLocal";
    })(CodeTokenType || (CodeTokenType = {}));
    class Token {
        constructor() {
            this.TokenType = CodeTokenType.Invalid;
            this.SourceInformation = new SourceMapping('', 0, '');
            this.Address = 0;
            this.Options = [];
        }
    }
    class InstructionToken {
        constructor(Instruction, Addressing, AddressingLength, Operand1 = '', Operand2 = '') {
            this.Instruction = Instruction;
            this.Addressing = Addressing;
            this.AddressingLength = AddressingLength;
            this.Operand1 = Operand1;
            this.Operand2 = Operand2;
        }
        ToString() {
            return `${Emulator.Instruction[this.Instruction]}`
                + ` ${Emulator.Addressing[this.Addressing]} (${AddressingLength[this.AddressingLength]})`
                + ` [${this.Operand1}, ${this.Operand2}]`;
        }
    }
    let AddressingLength;
    (function (AddressingLength) {
        AddressingLength[AddressingLength["None"] = 0] = "None";
        AddressingLength[AddressingLength["Byte"] = 1] = "Byte";
        AddressingLength[AddressingLength["Word"] = 2] = "Word";
        AddressingLength[AddressingLength["Long"] = 3] = "Long";
    })(AddressingLength || (AddressingLength = {}));
    const InvalidAddress = 0xFFFFFFFF;
    class ScopeItem {
        constructor() {
            this.Address = InvalidAddress;
            this.LocalScope = {};
            this.LocalDefine = {};
        }
    }
    class LocalScopeItem {
        constructor() {
            this.Address = InvalidAddress;
        }
    }
    class DefineItem {
        constructor() {
            this.DefinedScope = '';
            this.DefinedAddress = InvalidAddress;
            this.Value = InvalidAddress;
        }
    }
    class SourceMapping {
        constructor(File, Line, Source) {
            this.File = File;
            this.Line = Line;
            this.Source = Source;
        }
    }
    Assembler_1.SourceMapping = SourceMapping;
    class DataChunk {
        constructor() {
            this.Address = InvalidAddress;
            this.Data = [];
            this.Source = [];
        }
    }
    Assembler_1.DataChunk = DataChunk;
    class InstructionPattern {
        constructor() {
            this.Pattern = '';
            this.Addressing = Emulator.Addressing.Implied;
            this.Fallback = true;
        }
    }
    class HexFile {
        static ChunksToText(chunks, columns = 16) {
            const hexFile = [];
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                let str = `[${i}] $${Utility.Format.ToHexString(chunk.Address, 6)} ${chunk.Data.length} byte(s)`;
                for (let j = 0; j < chunk.Data.length; j++) {
                    if ((j % columns) == 0) {
                        hexFile.push(str);
                        str = `  $${Utility.Format.ToHexString(chunk.Address + j, 6)} :`;
                    }
                    str += ` ${Utility.Format.ToHexString(chunk.Data[j], 2)}`;
                }
                hexFile.push(str);
            }
            return hexFile;
        }
        static ChunksToIntelHex(chunks) {
            const hexFile = [];
            const pushData = (data) => {
                let checksum = 0;
                let str = ':';
                data[0] = data.length - 4;
                for (let i = 0; i < data.length; i++) {
                    const value = Utility.Type.ToByte(data[i]);
                    checksum += value;
                    str += Utility.Format.ToHexString(value, 2);
                }
                checksum = Utility.Type.ToByte(-checksum);
                str += Utility.Format.ToHexString(checksum, 2);
                hexFile.push(str);
            };
            for (let c = 0; c < chunks.length; c++) {
                const chunk = chunks[c];
                pushData([0x02, 0x00, 0x00, 0x04, chunk.Address >> 24, chunk.Address >> 16]);
                let content = [0x00, chunk.Address >> 8, chunk.Address, 0x00];
                for (let i = 0; i < chunk.Data.length; i++) {
                    if (content.length >= (16 + 4)) {
                        pushData(content);
                        const address = chunk.Address + i;
                        content = [0x00, address >> 8, address, 0x00];
                    }
                    content.push(chunk.Data[i]);
                }
                if (content.length > 4) {
                    pushData(content);
                }
                pushData([0x00, 0x00, 0x00, 0x01]);
            }
            return hexFile;
        }
        static ChunksToSRec(chunks) {
            const hexFile = [];
            const pushData = (data) => {
                let checksum = Utility.Type.ToByte(data.length - 1);
                let str = 'S' + data[0] + Utility.Format.ToHexString(checksum, 2);
                for (let i = 2; i < data.length; i++) {
                    const value = Utility.Type.ToByte(data[i]);
                    checksum += value;
                    str += Utility.Format.ToHexString(value, 2);
                }
                checksum = Utility.Type.ToByte(checksum ^ 0xFF);
                str += Utility.Format.ToHexString(checksum, 2);
                hexFile.push(str);
            };
            for (let c = 0; c < chunks.length; c++) {
                const chunk = chunks[c];
                let content = [0x02, 0x00, chunk.Address >> 16, chunk.Address >> 8, chunk.Address];
                for (let i = 0; i < chunk.Data.length; i++) {
                    if (content.length >= (16 + 5)) {
                        pushData(content);
                        const address = chunk.Address + i;
                        content = [0x02, 0x00, address >> 16, address >> 8, address];
                    }
                    content.push(chunk.Data[i]);
                }
                if (content.length > 5) {
                    pushData(content);
                }
                pushData([0x08, 0x00, 0x00, 0x00, 0x00]);
            }
            return hexFile;
        }
    }
    Assembler_1.HexFile = HexFile;
})(Assembler || (Assembler = {}));
var Application;
(function (Application) {
    var _a;
    class Main {
        static Initialize() {
            _a.Assembled = null;
            if (!_a.GetDomElements()) {
                return;
            }
            DomUtility.AllowTab(_a.Dom.AssemblerSource);
            DomUtility.ApplyDomEvents('.hexinput', DomUtility.HexadecimalInput);
            DomUtility.ApplyDomEvents('.intinput', DomUtility.IntegerInput);
            DomUtility.ApplyDomEvents('#ViewerSelect input[type="radio"] ', _a.CheckSelectedViewer);
            _a.Dom.AssemblerAssemble.removeAttribute('disabled');
            _a.Dom.CopyUrl.removeAttribute('disabled');
            _a.Dom.AssemblerAssemble.addEventListener('click', _a.Assemble);
            _a.Dom.AssembledRun.addEventListener('click', _a.Run);
            _a.ClearResultViewer();
            _a.UpdateSelectedViewer();
            const setting = _a.GetUrlParameter();
            if (setting) {
                _a.SetSetting(setting);
                if (setting.Source.length > 0) {
                    _a.Dom.AssemblerAssemble.click();
                    _a.Dom.AssembledRun.click();
                }
            }
            _a.Dom.ErrorMessage.classList.add('hide');
        }
        static GetDomElements() {
            let result = true;
            const set = (name) => {
                const element = document.querySelector('#' + name);
                if (element) {
                    _a.Dom[name] = element;
                    return true;
                }
                return false;
            };
            for (const key in _a.Dom) {
                result && (result = set(key));
            }
            return result;
        }
        static Assemble() {
            _a.ResultEnable = false;
            _a.Assembled = null;
            _a.ClearResultViewer();
            const setting = _a.GetSetting();
            const source = setting.Source;
            if ((!source) || (source.length <= 0)) {
                _a.SetAssemblerError(false, []);
                return;
            }
            const [assembled, message] = Assembler.Assembler.Assemble(source, setting.StartAddress);
            if (assembled === null) {
                _a.SetAssemblerError(false, message);
                return;
            }
            const outputHex = Assembler.HexFile.ChunksToText(assembled);
            _a.SetTextareaStrings(_a.Dom.AssemblerOutput, outputHex);
            const intelHex = Assembler.HexFile.ChunksToIntelHex(assembled);
            _a.SetTextareaStrings(_a.Dom.HexIntelHex, intelHex);
            const mSrec = Assembler.HexFile.ChunksToSRec(assembled);
            _a.SetTextareaStrings(_a.Dom.HexSrec, mSrec);
            _a.SetAssemblerError(true, []);
            _a.Assembled = assembled;
        }
        static Run() {
            const memory = new Emulator.SnesMemory();
            _a.Memory = memory;
            const setting = _a.GetSetting();
            memory.ROMMapping = setting.RomMapping;
            memory.IsFastROM = setting.FastRom;
            const maxCycle = setting.MaxCycle;
            const statusFlagE = setting.StatusFlagE;
            _a.UploadDefaultMemory(setting.StartAddress);
            _a.UploadMemory();
            const cpu = new Emulator.Cpu(_a.Memory);
            _a.Cpu = cpu;
            const initialRegisters = new Emulator.Registers();
            initialRegisters.SetStatusFlagE(statusFlagE);
            cpu.ResetRegisters = {
                PB: Utility.Type.ToByte(setting.StartAddress >> 16),
                PC: Utility.Type.ToWord(setting.StartAddress & 0x00FFFF),
                E: (setting.StatusFlagE) ? 1 : 0,
            };
            cpu.Boot();
            let stepCounter = 0;
            while ((!cpu.CpuHalted) && (cpu.MasterCycleCounter < maxCycle) && (stepCounter < maxCycle)) {
                cpu.Step();
                stepCounter++;
                if (cpu.Logs.length > 0) {
                    const lastInstruction = cpu.Logs[cpu.Logs.length - 1].Instruction;
                    const settingStop = setting.GetEmulationStopInstruction(lastInstruction);
                    if (settingStop) {
                        break;
                    }
                }
            }
            _a.ResultEnable = true;
            _a.UpdateResultViewer(cpu);
        }
        static UploadChunk(memory, chunk) {
            for (let i = 0; i < chunk.Data.length; i++) {
                memory.WriteSourceByte(chunk.Address + i, chunk.Data[i], chunk.Source[i]);
            }
        }
        static UploadDefaultMemory(startAddress) {
            const resetVector = {
                Address: 0x00FFE0,
                Data: [],
                Source: [],
            };
            const pushWord = (chunk, value) => {
                chunk.Data.push(Utility.Type.ToByte(value >> 0));
                chunk.Data.push(Utility.Type.ToByte(value >> 8));
            };
            for (let i = 0; i < 16; i++) {
                pushWord(resetVector, startAddress);
            }
            _a.UploadChunk(_a.Memory, resetVector);
        }
        static UploadMemory() {
            if (_a.Assembled === null) {
                return;
            }
            for (let i = 0; i < _a.Assembled.length; i++) {
                _a.UploadChunk(_a.Memory, _a.Assembled[i]);
            }
        }
        static SetAssemblerError(success, errorMessages) {
            const className = 'errorMessage';
            if (success) {
                _a.Dom.AssemblerOutput.classList.remove(className);
                _a.Dom.AssembledRun.removeAttribute('disabled');
            }
            else {
                const messages = Assembler.Assembler.ConvertErrorStrings(errorMessages);
                _a.SetTextareaStrings(_a.Dom.AssemblerOutput, messages);
                _a.Dom.AssemblerOutput.classList.add(className);
                _a.ClearTextarea(_a.Dom.HexIntelHex);
                _a.ClearTextarea(_a.Dom.HexSrec);
                _a.Dom.AssembledRun.setAttribute('disabled', '');
            }
        }
        static SetTextareaStrings(textarea, strings) {
            let text = '';
            for (let i = 0; i < strings.length; i++) {
                text += strings[i] + '\n';
            }
            textarea.textContent = text;
        }
        static ClearTextarea(textarea) {
            textarea.textContent = '';
        }
        static GetSetting() {
            function getDom(name) {
                const dom = document.querySelector('#SettingForm input[name="' + name + '"]');
                return dom !== null && dom !== void 0 ? dom : _a.dummyInputNode;
            }
            const setting = new Setting;
            setting.RomMapping = DomUtility.GetFormRadio('#SettingForm', 'mapping', {
                'lorom': Emulator.RomMapping.LoROM,
                'hirom': Emulator.RomMapping.HiROM,
            }, Emulator.RomMapping.LoROM);
            setting.FastRom = _a.GetFormBoolean(getDom('fastrom'));
            setting.StatusFlagE = _a.GetFormBoolean(getDom('eflag'));
            setting.StartAddress = _a.GetFormNumber(getDom('startpc'), 16, 0x008000);
            setting.MaxCycle = _a.GetFormNumber(getDom('cycle'), 10, 10000);
            setting.EmulationStopSTP = _a.GetFormBoolean(getDom('stops'));
            setting.EmulationStopWAI = _a.GetFormBoolean(getDom('stopw'));
            setting.EmulationStopBRK = _a.GetFormBoolean(getDom('stopb'));
            setting.EmulationStopCOP = _a.GetFormBoolean(getDom('stopc'));
            setting.EmulationStopWDM = _a.GetFormBoolean(getDom('stopr'));
            setting.Source = _a.Dom.AssemblerSource.value;
            setting.ViewerMode = DomUtility.GetFormRadio('#ViewerSelect', 'viewer', {
                'textlog': ViewerMode.TextLog,
                'tablelog': ViewerMode.TableLog,
                'timeline': ViewerMode.Timeline,
                'heatmap': ViewerMode.Heatmap,
                'written': ViewerMode.Written,
            }, ViewerMode.TextLog);
            return setting;
        }
        static GetFormBoolean(dom) {
            return dom.checked;
        }
        static GetFormNumber(dom, base, defaultValue) {
            const value = parseInt(dom.value, base);
            return (isNaN(value)) ? defaultValue : value;
        }
        static SetSetting(setting) {
            function getDom(name, value = null) {
                let query = '#SettingForm input[name="' + name + '"]';
                if (value !== null) {
                    query += '[value="' + value + '"]';
                }
                const dom = document.querySelector(query);
                return dom !== null && dom !== void 0 ? dom : _a.dummyInputNode;
            }
            _a.SetFormBoolean(getDom('mapping', 'lorom'), setting.RomMapping === Emulator.RomMapping.LoROM);
            _a.SetFormBoolean(getDom('mapping', 'hirom'), setting.RomMapping === Emulator.RomMapping.HiROM);
            _a.SetFormBoolean(getDom('fastrom'), setting.FastRom);
            _a.SetFormBoolean(getDom('eflag'), setting.StatusFlagE);
            _a.SetFormHexadecimal(getDom('startpc'), setting.StartAddress);
            _a.SetFormInteger(getDom('cycle'), setting.MaxCycle);
            _a.SetFormBoolean(getDom('stopw'), setting.EmulationStopWAI);
            _a.SetFormBoolean(getDom('stopb'), setting.EmulationStopBRK);
            _a.SetFormBoolean(getDom('stopc'), setting.EmulationStopCOP);
            _a.SetFormBoolean(getDom('stopr'), setting.EmulationStopWDM);
            if (setting.Source.length > 0) {
                _a.Dom.AssemblerSource.value = setting.Source;
            }
            DomUtility.SetFormRadio('#ViewerSelect', 'viewer', {
                textlog: ViewerMode.TextLog,
                tablelog: ViewerMode.TableLog,
                timeline: ViewerMode.Timeline,
                heatmap: ViewerMode.Heatmap,
                written: ViewerMode.Written,
            }, setting.ViewerMode, 'textlog');
            _a.UpdateSelectedViewer(setting.ViewerMode);
        }
        static SetFormBoolean(dom, value) {
            dom.checked = value;
        }
        static SetFormInteger(dom, value) {
            dom.value = value.toString();
        }
        static SetFormHexadecimal(dom, value) {
            var _b, _c;
            const digit = (_c = parseInt((_b = dom.getAttribute('maxlength')) !== null && _b !== void 0 ? _b : '0')) !== null && _c !== void 0 ? _c : 0;
            dom.value = Utility.Format.ToHexString(value, digit);
        }
        static GetUrlParameter() {
            if (location.search.length <= 0) {
                return null;
            }
            const search = (location.search[0] === '?') ? location.search.substring(1) : location.search;
            const parameters = search.split('&');
            const setting = new Setting();
            function split(parameter) {
                const index = parameter.indexOf('=');
                if (index >= 1) {
                    const left = parameter.substring(0, index);
                    const right = parameter.substring(index + 1);
                    return [left, right];
                }
                else {
                    return [parameter, ''];
                }
            }
            function parameterToBoolean(parameter, defaultValue) {
                const num = parseInt(parameter);
                if (!isNaN(num)) {
                    return !!num;
                }
                else if (parameter.toUpperCase() === 'TRUE') {
                    return true;
                }
                else if (parameter.toUpperCase() === 'FALSE') {
                    return false;
                }
                return defaultValue;
            }
            function parameterToInteger(parameter, base, defaultValue) {
                const num = parseInt(parameter, base);
                if (!isNaN(num)) {
                    return num;
                }
                return defaultValue;
            }
            for (const index in parameters) {
                const [key, value] = split(parameters[index]);
                switch (key.toLowerCase()) {
                    case 'rm': {
                        switch (value.toLowerCase()) {
                            case 'lo':
                                setting.RomMapping = Emulator.RomMapping.LoROM;
                                break;
                            case 'hi':
                                setting.RomMapping = Emulator.RomMapping.HiROM;
                                break;
                        }
                        break;
                    }
                    case 'fr':
                        setting.FastRom = parameterToBoolean(value, setting.FastRom);
                        break;
                    case 'sfe':
                        setting.StatusFlagE = parameterToBoolean(value, setting.StatusFlagE);
                        break;
                    case 'sa':
                        setting.StartAddress = parameterToInteger(value, 16, setting.StartAddress);
                        break;
                    case 'mc':
                        setting.MaxCycle = parameterToInteger(value, 10, setting.MaxCycle);
                        break;
                    case 'esw':
                        setting.EmulationStopWAI = parameterToBoolean(value, setting.EmulationStopWAI);
                        break;
                    case 'esb':
                        setting.EmulationStopBRK = parameterToBoolean(value, setting.EmulationStopBRK);
                        break;
                    case 'esc':
                        setting.EmulationStopCOP = parameterToBoolean(value, setting.EmulationStopCOP);
                        break;
                    case 'esr':
                        setting.EmulationStopWDM = parameterToBoolean(value, setting.EmulationStopWDM);
                        break;
                    case 'src':
                        setting.Source = _a.DecodeSource(value);
                        break;
                    case 'zsrc':
                        setting.Source = _a.DecodeCompressedSource(value);
                        break;
                    case 'vm': {
                        for (let mode in ViewerMode) {
                            const enumIndex = parseInt(mode);
                            if (isNaN(enumIndex)) {
                                continue;
                            }
                            const enumValue = enumIndex;
                            if (value.toLocaleLowerCase() === ViewerMode[enumValue].toLowerCase()) {
                                setting.ViewerMode = enumValue;
                            }
                        }
                        break;
                    }
                }
            }
            return setting;
        }
        static GetCopyUrl() {
            let url = location.origin + location.pathname;
            const setting = _a.GetSetting();
            function booleanToParameter(value) {
                return (value) ? '1' : '0';
            }
            url += `?rm=${(setting.RomMapping === Emulator.RomMapping.HiROM) ? 'hi' : 'lo'}`;
            url += `&fr=${booleanToParameter(setting.FastRom)}`;
            url += `&sfe=${booleanToParameter(setting.StatusFlagE)}`;
            url += `&sa=${Utility.Format.ToHexString(setting.StartAddress, 6)}`;
            url += `&mc=${setting.MaxCycle.toString()}`;
            url += `&esw=${booleanToParameter(setting.EmulationStopWAI)}`;
            url += `&esb=${booleanToParameter(setting.EmulationStopBRK)}`;
            url += `&esc=${booleanToParameter(setting.EmulationStopCOP)}`;
            url += `&esr=${booleanToParameter(setting.EmulationStopWDM)}`;
            const rawSource = _a.EncodeSource(setting.Source);
            const compressedSource = _a.EncodeCompressedSource(setting.Source);
            if (rawSource.length < compressedSource.length) {
                url += `&src=${rawSource}`;
            }
            else {
                url += `&zsrc=${compressedSource}`;
            }
            return url;
        }
        static EncodeSource(src) {
            const urlEncodedSource = encodeURIComponent(src);
            return urlEncodedSource;
        }
        static DecodeSource(src) {
            const urlDecodedSource = decodeURIComponent(src);
            return urlDecodedSource;
        }
        static EncodeCompressedSource(src) {
            let compressed = Utility.StringCompression.Compress(src);
            compressed = compressed.replace(/\+/g, '-');
            compressed = compressed.replace(/\//g, '_');
            compressed = compressed.replace(/=+$/, '');
            return compressed;
        }
        static DecodeCompressedSource(src) {
            var _b;
            let compressed = src;
            compressed = compressed.replace(/\-/g, '+');
            compressed = compressed.replace(/\_/g, '/');
            return (_b = Utility.StringCompression.Decompress(compressed)) !== null && _b !== void 0 ? _b : '';
        }
        static DumpCpuLog(cpu) {
            for (let i = 0; i < cpu.Logs.length; i++) {
                const instructionLog = cpu.Logs[i];
                console.log(`[${i}] ${instructionLog.GetLogString()}`);
                for (let j = 0; j < instructionLog.AccessLog.length; j++) {
                    const accessLog = instructionLog.AccessLog[j];
                    console.log('  ' + Emulator.StepLog.AccessLogToString(accessLog));
                }
            }
        }
        static UpdateSelectedViewer(selected = null) {
            if (selected === null) {
                selected = DomUtility.GetFormRadio('#ViewerSelect', 'viewer', {
                    textlog: ViewerMode.TextLog,
                    tablelog: ViewerMode.TableLog,
                    timeline: ViewerMode.Timeline,
                    heatmap: ViewerMode.Heatmap,
                    written: ViewerMode.Written,
                }, ViewerMode.TextLog);
            }
            const viewerList = [
                _a.Dom.ViewerTextLog,
                _a.Dom.ViewerTableLog,
                _a.Dom.ViewerTimeline,
                _a.Dom.ViewerHeatmap,
                _a.Dom.ViewerWritten,
            ];
            viewerList.forEach((viewer) => {
                viewer.classList.add('hide');
            });
            let selectedDom = viewerList[selected];
            selectedDom.classList.remove('hide');
            if (_a.ResultEnable) {
                switch (selected) {
                    case ViewerMode.Timeline:
                        this.UpdateResultViewer_Timeline(_a.Cpu);
                        break;
                }
            }
        }
        static CheckSelectedViewer(element) {
            element.addEventListener('change', (e) => {
                _a.UpdateSelectedViewer();
            });
        }
        static ClearResultViewer() {
            const clearText = '---';
            _a.Dom.ResultStatistics_Step.textContent = clearText;
            _a.Dom.ResultStatistics_Cycle.textContent = clearText;
            _a.Dom.ResultStatistics_Master.textContent = clearText;
            _a.ClearResultViewerFunctions.forEach((clearFunction) => {
                try {
                    clearFunction();
                }
                catch (_b) { }
            });
            _a.TimelineGenerated = false;
        }
        static UpdateResultViewer(cpu) {
            _a.ClearResultViewer();
            _a.Dom.ResultStatistics_Step.textContent = cpu.Logs.length.toString();
            _a.Dom.ResultStatistics_Cycle.textContent = cpu.CpuCycleCounter.toString();
            _a.Dom.ResultStatistics_Master.textContent = cpu.MasterCycleCounter.toString();
            _a.UpdateResultViewerFunctions.forEach((updateFunction) => {
                try {
                    updateFunction(cpu);
                }
                catch (_b) { }
            });
            _a.UpdateSelectedViewer();
        }
        static ClearResultViewer_TextLog() {
            _a.ClearTextarea(_a.Dom.ViewerTextLog_Log);
        }
        static UpdateResultViewer_TextLog(cpu) {
            let logStrings = [];
            for (let s = 0; s < cpu.Logs.length; s++) {
                const step = cpu.Logs[s];
                logStrings.push(step.GetLogString());
                for (let c = 0; c < step.AccessLog.length; c++) {
                    const accessLog = step.AccessLog[c];
                    logStrings.push('  ' + Emulator.StepLog.AccessLogToString(accessLog));
                }
            }
            _a.SetTextareaStrings(_a.Dom.ViewerTextLog_Log, logStrings);
        }
        static ClearResultViewer_TableLog() {
        }
        static UpdateResultViewer_TableLog(cpu) {
        }
        static ClearResultViewer_Timeline() {
            const tableCols = 3;
            const tableHeader = document.querySelectorAll('#ViewerTimeline_Table th');
            if (!tableHeader) {
                return;
            }
            for (let i = tableHeader.length - 1; tableCols <= i; i--) {
                tableHeader.item(i).remove();
            }
            tableHeader[tableCols - 1].textContent = 'Timeline';
            tableHeader[tableCols - 1].classList.add('dummyTimeline');
            _a.ClearTableBody('#ViewerTimeline_Table', tableCols);
            const tableBody = document.querySelector('#ViewerTimeline_Table tbody tr');
            if (!tableBody) {
                return;
            }
            tableBody.children[0].classList.add('sticky');
            tableBody.children[1].classList.add('sticky');
        }
        static UpdateResultViewer_Timeline(cpu) {
            var _b;
            if (_a.TimelineGenerated) {
                return;
            }
            const tableHeader = document.querySelector('#ViewerTimeline_Table thead tr');
            if (!tableHeader) {
                return;
            }
            const tableBody = document.querySelector('#ViewerTimeline_Table tbody');
            if (!tableBody) {
                return;
            }
            const timelineLogs = [];
            const stepLength = [];
            for (let s = 0; s < cpu.Logs.length; s++) {
                const step = cpu.Logs[s];
                const entry = (_b = timelineLogs[step.InstructionAddress]) !== null && _b !== void 0 ? _b : [];
                entry.push(step);
                timelineLogs[step.InstructionAddress] = entry;
                stepLength.push(step.GetExecuteCpuCycle());
            }
            let timelineRow = 0;
            timelineLogs.forEach(() => timelineRow++);
            if (stepLength.length <= 0) {
                return;
            }
            const checkCell = timelineRow * stepLength.length;
            if (checkCell >= _a.TimelineWarning) {
                if (!window.confirm('Displays a very large table.\nIt may slow down your browser.\nIs it OK?')) {
                    return;
                }
            }
            DomUtility.RemoveCildren(tableBody);
            const tableCols = 2;
            for (let i = tableHeader.children.length - 1; tableCols <= i; i--) {
                tableHeader.children[i].remove();
            }
            let timelineHeaderCycle = 0;
            for (let s = 0; s < stepLength.length; s++) {
                const colTime = document.createElement('th');
                tableHeader.appendChild(colTime);
                colTime.classList.add('timeline');
                colTime.classList.add('instructionStart');
                colTime.setAttribute('colspan', stepLength[s].toString());
                colTime.textContent = cpu.Logs[s].MasterCycle.toString();
            }
            function addRow(row) {
                const address = row[0].InstructionAddress;
                const code = row[0].GetInstructionLogString();
                const tableRow = document.createElement('tr');
                const colAddress = document.createElement('td');
                colAddress.textContent = `$${Utility.Format.ToHexString(address, 6)}`;
                colAddress.classList.add('sticky');
                colAddress.classList.add('address');
                tableRow.appendChild(colAddress);
                const colCode = document.createElement('td');
                colCode.textContent = code;
                colCode.classList.add('sticky');
                colCode.classList.add('code');
                tableRow.appendChild(colCode);
                let rowIndex = 0;
                let nowCycle = 0;
                for (let s = 0; s < stepLength.length; s++) {
                    if ((row.length <= rowIndex) || (row[rowIndex].CpuCycle !== nowCycle)) {
                        const colTime = document.createElement('td');
                        tableRow.appendChild(colTime);
                        colTime.classList.add('instructionStart');
                        colTime.setAttribute('colspan', stepLength[s].toString());
                    }
                    else {
                        const step = row[rowIndex];
                        let instructionCycle = step.MasterCycle;
                        for (let c = 0; c < step.AccessLog.length; c++) {
                            const access = step.AccessLog[c];
                            const colCycle = document.createElement('td');
                            tableRow.appendChild(colCycle);
                            colCycle.classList.add('data');
                            colCycle.classList.add(Emulator.AccessType[access.Type]);
                            colCycle.classList.add(Emulator.AccessSpeed[access.Cycle]);
                            let tooltip = '';
                            tooltip += `Cycle: ${instructionCycle}` + '\n';
                            tooltip += `Access: ${Emulator.AccessType[access.Type]}` + '\n';
                            tooltip += `Address: $${Utility.Format.ToHexString(access.AddressBus, 6)}` + '\n';
                            tooltip += `Data: $${Utility.Format.ToHexString(access.DataBus, 2)}` + '\n';
                            tooltip += `Region: ${Emulator.AccessRegion[access.Region]} @ ${Emulator.AccessSpeed[access.Cycle]}`;
                            colCycle.setAttribute('title', tooltip);
                            if (c === 0) {
                                colCycle.classList.add('instructionStart');
                            }
                            instructionCycle += access.Cycle;
                        }
                        rowIndex++;
                    }
                    nowCycle += stepLength[s];
                }
                tableBody === null || tableBody === void 0 ? void 0 : tableBody.appendChild(tableRow);
                return tableRow;
            }
            for (const key in timelineLogs) {
                const row = addRow(timelineLogs[key]);
            }
            _a.TimelineGenerated = true;
        }
        static ClearResultViewer_Heatmap() {
            _a.ClearTableBody('#ViewerHeatmap_Table', 5);
        }
        static UpdateResultViewer_Heatmap(cpu) {
            const tableBody = document.querySelector('#ViewerHeatmap_Table tbody');
            if (!tableBody) {
                return;
            }
            const heatmap = [];
            function getEntry(stepLog) {
                var _b, _c, _d, _e;
                for (let i = 0; i < heatmap.length; i++) {
                    if (stepLog.InstructionAddress === heatmap[i].Address) {
                        return heatmap[i];
                    }
                }
                let logString = stepLog.GetInstructionLogString();
                const entry = new Viewer_Heatmap_Log();
                entry.Line = (_c = (_b = stepLog.Source) === null || _b === void 0 ? void 0 : _b.Line) !== null && _c !== void 0 ? _c : -1;
                entry.Address = stepLog.InstructionAddress;
                entry.Code = (_e = (_d = stepLog.Source) === null || _d === void 0 ? void 0 : _d.Source) !== null && _e !== void 0 ? _e : logString;
                entry.Cycle = 0;
                entry.Rate = 0;
                heatmap.push(entry);
                heatmap.sort(function (a, b) {
                    const diffAddress = a.Address - b.Address;
                    if (diffAddress !== 0) {
                        return diffAddress;
                    }
                    return a.Line - b.Line;
                });
                return entry;
            }
            function updateEntry(stepLog) {
                const entry = getEntry(stepLog);
                entry.Cycle += stepLog.GetExecuteMasterCycle();
                entry.Rate = entry.Cycle / _a.Cpu.MasterCycleCounter;
            }
            for (let s = 0; s < cpu.Logs.length; s++) {
                const step = cpu.Logs[s];
                updateEntry(step);
            }
            if (heatmap.length <= 0) {
                return;
            }
            DomUtility.RemoveCildren(tableBody);
            function createRow(parent, className) {
                const cell = document.createElement('td');
                parent.appendChild(cell);
                cell.classList.add(className);
                return cell;
            }
            for (let i = 0; i < heatmap.length; i++) {
                const history = heatmap[i];
                const row = document.createElement('tr');
                const cellLine = createRow(row, 'line');
                const cellAddress = createRow(row, 'address');
                const cellCode = createRow(row, 'code');
                const cellCycle = createRow(row, 'cycle');
                const cellRate = createRow(row, 'rate');
                tableBody.appendChild(row);
                row.setAttribute('style', `background-color: RGBA(${_a.HeatmapColor}, ${history.Rate * _a.HeatmapMaxIntensity});`);
                if (history.Line >= 0) {
                    cellLine.textContent = `${history.Line}`;
                }
                else {
                    cellLine.textContent = '---';
                    cellLine.setAttribute('style', 'text-align:center;');
                }
                cellAddress.textContent = `$${Utility.Format.ToHexString(history.Address, 6)}`;
                cellCode.textContent = history.Code;
                cellCycle.textContent = `${history.Cycle}`;
                cellRate.textContent = `${(history.Rate * 100).toFixed(1)} %`;
            }
        }
        static ClearResultViewer_Written() {
            _a.ClearTableBody('#ViewerWritten_Table', 5);
        }
        static UpdateResultViewer_Written(cpu) {
            var _b, _c;
            const tableBody = document.querySelector('#ViewerWritten_Table tbody');
            if (!tableBody) {
                return;
            }
            const writeAccess = [];
            const writeHistory = {};
            for (let s = 0; s < cpu.Logs.length; s++) {
                const step = cpu.Logs[s];
                let cycle = step.MasterCycle;
                for (let c = 0; c < step.AccessLog.length; c++) {
                    const accessLog = step.AccessLog[c];
                    switch (accessLog.Type) {
                        case Emulator.AccessType.Write:
                        case Emulator.AccessType.WriteDummy:
                        case Emulator.AccessType.PushStack:
                            {
                                const history = (_b = writeHistory[accessLog.AddressBus]) !== null && _b !== void 0 ? _b : [];
                                writeHistory[accessLog.AddressBus] = history;
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
                    cycle += accessLog.Cycle;
                }
            }
            if (writeAccess.length <= 0) {
                return;
            }
            DomUtility.RemoveCildren(tableBody);
            writeAccess.sort((a, b) => a.Address - b.Address);
            function createRow(parent, className) {
                const cell = document.createElement('td');
                parent.appendChild(cell);
                cell.classList.add(className);
                return cell;
            }
            function addHistory(cell, content, highlight) {
                const node = document.createElement('span');
                node.textContent = content;
                if (highlight) {
                    node.classList.add('highlight');
                }
                cell.appendChild(node);
            }
            for (let i = 0; i < writeAccess.length; i++) {
                const access = writeAccess[i];
                const history = (_c = writeHistory[access.Address]) !== null && _c !== void 0 ? _c : [];
                if (access.Repeat < (history.length - 1)) {
                    continue;
                }
                const row = document.createElement('tr');
                const cellRegion = createRow(row, 'region');
                const cellAddress = createRow(row, 'address');
                const cellValue = createRow(row, 'value');
                const cellTiming = createRow(row, 'timing');
                const cellHistory = createRow(row, 'history');
                tableBody.appendChild(row);
                cellRegion.textContent = Emulator.AccessRegion[access.Region];
                cellAddress.textContent = `$${Utility.Format.ToHexString(access.Address, 6)}`;
                cellValue.textContent = `$${Utility.Format.ToHexString(access.Value, 2)}`;
                cellTiming.textContent = `${access.Cycle}`;
                let isFirst = true;
                for (let h = 0; h < history.length; h++) {
                    if (!isFirst) {
                        addHistory(cellHistory, ', ', false);
                    }
                    isFirst = false;
                    addHistory(cellHistory, `$${Utility.Format.ToHexString(history[h], 2)}`, access.Repeat === h);
                }
            }
        }
        static ClearTableBody(selector, rowCount) {
            const tableBody = document.querySelector(selector + ' tbody');
            DomUtility.RemoveCildren(tableBody);
            if (tableBody) {
                const row = document.createElement('tr');
                tableBody.appendChild(row);
                function appendDummyChild() {
                    const cell = document.createElement('td');
                    cell.textContent = '---';
                    cell.classList.add('center');
                    row.appendChild(cell);
                }
                for (let i = 0; i < rowCount; i++) {
                    appendDummyChild();
                }
            }
        }
    }
    _a = Main;
    Main.Assembled = null;
    Main.Memory = new Emulator.SnesMemory();
    Main.Cpu = new Emulator.Cpu(_a.Memory);
    Main.dummyNode = document.createElement('span');
    Main.dummyInputNode = document.createElement('input');
    Main.Dom = {
        'ErrorMessage': _a.dummyNode,
        'AssemblerSource': _a.dummyNode,
        'AssemblerOutput': _a.dummyNode,
        'HexIntelHex': _a.dummyNode,
        'HexSrec': _a.dummyNode,
        'AssemblerAssemble': _a.dummyNode,
        'AssembledRun': _a.dummyNode,
        'CopyUrl': _a.dummyNode,
        'ResultStatistics_Step': _a.dummyNode,
        'ResultStatistics_Cycle': _a.dummyNode,
        'ResultStatistics_Master': _a.dummyNode,
        'ViewerTextLog': _a.dummyNode,
        'ViewerTextLog_Log': _a.dummyNode,
        'ViewerTableLog': _a.dummyNode,
        'ViewerTimeline': _a.dummyNode,
        'ViewerHeatmap': _a.dummyNode,
        'ViewerWritten': _a.dummyNode,
    };
    Main.ResultEnable = false;
    Main.HeatmapColor = '204, 0, 0';
    Main.HeatmapMaxIntensity = 1.00;
    Main.TimelineGenerated = false;
    Main.TimelineWarning = 100000;
    Main.ClearResultViewerFunctions = [
        _a.ClearResultViewer_TextLog,
        _a.ClearResultViewer_TableLog,
        _a.ClearResultViewer_Timeline,
        _a.ClearResultViewer_Heatmap,
        _a.ClearResultViewer_Written,
    ];
    Main.UpdateResultViewerFunctions = [
        _a.UpdateResultViewer_TextLog,
        _a.UpdateResultViewer_TableLog,
        _a.UpdateResultViewer_Heatmap,
        _a.UpdateResultViewer_Written,
    ];
    Application.Main = Main;
    class Setting {
        constructor() {
            this.RomMapping = Emulator.RomMapping.LoROM;
            this.FastRom = false;
            this.StatusFlagE = false;
            this.StartAddress = 0x008000;
            this.MaxCycle = 10000;
            this.EmulationStopSTP = true;
            this.EmulationStopWAI = true;
            this.EmulationStopBRK = true;
            this.EmulationStopCOP = true;
            this.EmulationStopWDM = false;
            this.Source = '';
            this.ViewerMode = ViewerMode.TextLog;
        }
        GetEmulationStopInstruction(instruction) {
            switch (instruction) {
                case Emulator.Instruction.STP: return this.EmulationStopSTP;
                case Emulator.Instruction.WAI: return this.EmulationStopWAI;
                case Emulator.Instruction.BRK: return this.EmulationStopBRK;
                case Emulator.Instruction.COP: return this.EmulationStopCOP;
                case Emulator.Instruction.WDM: return this.EmulationStopWDM;
            }
            return false;
        }
    }
    class DomUtility {
        static RemoveCildren(element) {
            if (!element) {
                return;
            }
            for (let i = element.children.length - 1; 0 <= i; i--) {
                element.children[i].remove();
            }
        }
        static GetFormRadio(selector, name, values, defaultValue) {
            for (const key in values) {
                const dom = document.querySelector(`${selector} input[name="${name}"][value="${key}"]`);
                if ((dom instanceof HTMLInputElement) && dom.checked) {
                    return values[key];
                }
            }
            return defaultValue;
        }
        static SetFormRadio(selector, name, values, inputValue, uncheckedKey) {
            let checked = false;
            for (const key in values) {
                const dom = document.querySelector(`${selector} input[name="${name}"][value="${key}"]`);
                if (dom instanceof HTMLInputElement) {
                    const check = values[key] === inputValue;
                    dom.checked = check;
                    checked || (checked = check);
                }
            }
            if ((!checked) && (uncheckedKey !== null)) {
                const dom = document.querySelector(`${selector} input[name="${name}"][value="${uncheckedKey}"]`);
                if (dom instanceof HTMLInputElement) {
                    dom.checked = true;
                }
            }
        }
        static ApplyDomEvents(selector, domEvent) {
            const doms = document.querySelectorAll(selector);
            doms.forEach((dom) => {
                domEvent(dom);
            });
        }
        static AllowTab(element) {
            element.addEventListener('keydown', (e) => {
                DomUtility.AllowTabEvent(element, e);
            });
        }
        static AllowTabEvent(element, e) {
            var _b, _c;
            if (e.key !== 'Tab') {
                return;
            }
            e.preventDefault();
            let value = element.value;
            const selectStart = (_b = element.selectionStart) !== null && _b !== void 0 ? _b : 0;
            const selectEnd = (_c = element.selectionEnd) !== null && _c !== void 0 ? _c : 0;
            const selectLeft = value.substring(0, selectStart);
            let selectContent = value.substring(selectStart, selectEnd);
            const selectRight = value.substring(selectEnd);
            if (!e.shiftKey) {
                const replaceBefore = selectContent.length;
                selectContent = selectContent.replace(/\n/g, '\n\t');
                const replaceCount = selectContent.length - replaceBefore;
                value = selectLeft + '\t' + selectContent + selectRight;
                element.value = value;
                element.selectionStart = selectStart + 1;
                element.selectionEnd = selectEnd + 1 + replaceCount;
            }
            else {
                const replaceBefore = selectContent.length;
                selectContent = selectContent.replace(/\n\t/g, '\n');
                selectContent = selectContent.replace(/^\t/g, '');
                const replaceCount = replaceBefore - selectContent.length;
                value = selectLeft + selectContent + selectRight;
                element.value = value;
                element.selectionStart = selectStart;
                element.selectionEnd = selectEnd - replaceCount;
            }
        }
        static FormattedInputSkipKey(key) {
            switch (key) {
                case 'Delete':
                case 'Backspace':
                case 'Shift':
                case 'Control':
                case 'Alt':
                case 'Tab':
                    return true;
            }
            if (key.indexOf('Arrow') === 0) {
                return true;
            }
            if (key.match(/^F\d+$/i)) {
                return true;
            }
            return false;
        }
        static IntegerInput(element) {
            element.addEventListener('keydown', (e) => {
                DomUtility.IntegerInputKeydownEvent(element, e);
            });
            element.addEventListener('change', (e) => {
                DomUtility.IntegerInputChangeEvent(element);
            });
            DomUtility.IntegerInputChangeEvent(element);
        }
        static IntegerInputKeydownEvent(element, e) {
            const key = e.key;
            if (e.getModifierState("Control")) {
                return;
            }
            else if (DomUtility.FormattedInputSkipKey(key)) {
                return;
            }
            else if (key.length > 1) {
                e.preventDefault();
            }
            const match = key.match(/^\d$/i);
            if (!match) {
                e.preventDefault();
            }
        }
        static IntegerInputChangeEvent(element) {
            var _b, _c;
            const value = element.value;
            const match = value.match(/^[\d]+$/i);
            if (match) {
                const converted = parseInt(match[0]);
                element.setAttribute('_previous', converted.toString());
            }
            else {
                const previousValue = (_c = parseInt((_b = element.getAttribute('_previous')) !== null && _b !== void 0 ? _b : '0')) !== null && _c !== void 0 ? _c : 0;
                const setValue = Utility.Format.ToHexString(previousValue);
                element.value = setValue;
            }
        }
        static HexadecimalInput(element) {
            element.addEventListener('keydown', (e) => {
                DomUtility.HexadecimalInputKeydownEvent(element, e);
            });
            element.addEventListener('change', (e) => {
                DomUtility.HexadecimalInputChangeEvent(element);
            });
            DomUtility.HexadecimalInputChangeEvent(element);
        }
        static HexadecimalInputKeydownEvent(element, e) {
            const key = e.key;
            if (e.getModifierState("Control")) {
                return;
            }
            else if (DomUtility.FormattedInputSkipKey(key)) {
                return;
            }
            else if (key.length > 1) {
                e.preventDefault();
            }
            const match = key.match(/^[\dA-F]$/i);
            if (!match) {
                e.preventDefault();
            }
        }
        static HexadecimalInputChangeEvent(element) {
            var _b, _c, _d, _e;
            const value = element.value;
            const digit = (_c = parseInt((_b = element.getAttribute('maxlength')) !== null && _b !== void 0 ? _b : '0')) !== null && _c !== void 0 ? _c : 0;
            const match = value.match(/^[\dA-F]+$/i);
            if (match) {
                const converted = parseInt(match[0], 16);
                element.setAttribute('_previous', Utility.Format.ToHexString(converted, digit));
            }
            else {
                const previousValue = (_e = parseInt((_d = element.getAttribute('_previous')) !== null && _d !== void 0 ? _d : '0', 16)) !== null && _e !== void 0 ? _e : 0;
                const setValue = Utility.Format.ToHexString(previousValue, digit);
                element.value = setValue;
            }
        }
    }
    let ViewerMode;
    (function (ViewerMode) {
        ViewerMode[ViewerMode["TextLog"] = 0] = "TextLog";
        ViewerMode[ViewerMode["TableLog"] = 1] = "TableLog";
        ViewerMode[ViewerMode["Timeline"] = 2] = "Timeline";
        ViewerMode[ViewerMode["Heatmap"] = 3] = "Heatmap";
        ViewerMode[ViewerMode["Written"] = 4] = "Written";
    })(ViewerMode || (ViewerMode = {}));
    class Viewer_Heatmap_Log {
        constructor() {
            this.Line = 0;
            this.Address = 0;
            this.Code = '';
            this.Cycle = 0;
            this.Rate = 0;
        }
    }
    class Viewer_Written_Log {
        constructor() {
            this.Region = Emulator.AccessRegion.MainRAM;
            this.Address = 0;
            this.Value = 0;
            this.Cycle = 0;
            this.Type = Emulator.AccessType.Write;
            this.Repeat = 0;
        }
    }
})(Application || (Application = {}));
