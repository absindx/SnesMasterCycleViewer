# SNES master cycle viewer  

**under development**  

A web application that emulates the SNES CPU in master clock units and displays the number of cycles it took to execute.  
Intended to assist in routine optimization.  

This is **not** intended to emulate SNES perfectly.  

## Accuracy

### Passed test

* [PeterLemon - CPUTest](https://github.com/PeterLemon/SNES)
* [gilyon - snes-tests](https://github.com/gilyon/snes-tests)

## ToDo  

* Add viewer
	* Table log
* CPU emulation
	* Pass test programs
	* Emulates direct page addressing wrapping in emulation mode
* I/O emulation
	* 5A22 Mul/Div test
	* WRAM data access
	* ...
* Manual
