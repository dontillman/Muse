// Triadex Muse in Javascript
//
// Copyright 2017-2019, J. Donald Tillman.  All rights reserved.
//
// The actual Muse was invented in 1969 by Marvin Minsky and Edward Fredkin at MIT.
// http://www.till.com/articles/muse
//
// This is purposely written in an older style so that it runs on
// older machines without polyfills.  (I use an early iPad for testing.)
//
// Use VexFlow for the music notation.
//
// My interpretation of how the C 1/2 works with single step.
//    * reset leaves C 1/2 in a one state
//    * hold  leaves C 1/2 in a one state
//    * hitting single-step drives C 1/2 low when you click,
//    * back up to high when you let go

// recent changes
// fixed the shift register to calculate its new value before things updated
// added drop shadow to the sliders
// fixed history issues

// i is the row number
function lampColor(i) {
    var lampBlue = '#77ccff';
    var lampGreen = '#55dd55';
    return (i < 9) ? lampBlue : lampGreen;
}

class Muse {
    // supply the id of the div where we will place the muse
    constructor(divId, presets) {
	this.div = document.getElementById(divId);
	this.presetsDiv = document.getElementById(presets);

	this.sliderRows = ['OFF', 'ON', 'C 1/2', 'C1', 'C2', 'C4', 'C8', 'C3', 'C6'];
	for (var i = 1; i <= 31; i++) {
	    this.sliderRows.push('B' + i);
	}

	this.state = new MuseState(this);

	// panel will lay itself out and draw
	this.panel = new MusePanel(this);
	this.audio = new MuseAudio();
	this.timer = null;

	// multiple Muses
	this.slaveWindows = [];
	// slave mode is 0 for off, 1 for on, higher for divide-by-N clock
	this.slaveMode = 0;
	// slave's divides-by-N counter
	this.slaveClockDivider = 0;
	// number of slaves for the master
	this.slaveCount = 0;

	var muse = this;
	window.addEventListener('resize',
				function() {
				    muse.layout();
				});
	window.addEventListener('beforeunload',
				function() {
				    if (muse.slaveMode) {
					window.opener.muse.unplug(window);
				    } else {
					for (var i = 0; i < muse.slaveWindows.length; i++) {
					    muse.slaveWindows[i].muse.unplug();
					}
				    }
				});
    }

    // The panel causes this to run after the Muse object is created,
    // and after the images have been loaded in.
    init() {
	if (window.opener) {
	    this.state.copy(window.opener.muse.state);
	    this.slaveMode = 1;
	}
	// perform layout and draw
	this.layout();
    }

    // sigh... layout by hand
    // don't show the presets div if we don't have enough width
    // limit the width of the presets div
    // space things out nicely
    layout() {
	// only do that layout for the museum version
	if (false) {
	    var top = 80;
	    var bottom = 60;
            // the available room in the app div
	    var appWidth = this.div.clientWidth;
	    var appHeight = this.div.clientHeight - top - bottom;
	    var minPresetsWidth = 250; // 300 for larger screen
	    var maxPresetsWidth = 500; // 550 for larger screen
	    var canvas = this.panel.canvas;
	    var presetsDiv = this.presetsDiv;

            // calculate for landscape, go to portrait if we can't fit
	    var margin = 40; // 20 for larger screen
	    var scale = appHeight / canvas.height;
	    var canvasWidth = Math.floor(scale * canvas.width);
	    var canvasHeight = Math.floor(scale * canvas.height);
	    var presetsWidth = Math.floor(appWidth - 3 * margin - canvasWidth);

	    // room for presets panel?
	    if (minPresetsWidth < presetsWidth) {
		if (maxPresetsWidth < presetsWidth) {
		    presetsWidth = maxPresetsWidth;
		    margin = Math.floor((appWidth - canvasWidth - presetsWidth) / 3);
		}
		presetsDiv.style.display = 'block';
		presetsDiv.style.top = top + 'px';
		presetsDiv.style.height = canvasHeight + 'px';
		presetsDiv.style.width = presetsWidth + 'px';
		presetsDiv.style.marginLeft = (2 * margin + canvasWidth) + 'px';
	    } else {
		// just the canvas
		var wScale = (appWidth - 2 * margin) / canvas.width; 
		scale = Math.min(scale, wScale);
		canvasWidth = Math.floor(scale * canvas.width);
		canvasHeight = Math.floor(scale * canvas.height);
		margin = Math.floor((appWidth - canvasWidth) / 2);
		presetsDiv.style.display = 'none';
	    }
	    canvas.style.marginTop = top + 'px';
	    canvas.style.width = canvasWidth + 'px';
	    canvas.style.height = canvasHeight + 'px';
	    canvas.style.marginLeft = margin + 'px';
            this.scale = scale;
	}
	this.draw();
    }

    draw() {
	var panel = this.panel;
	window.requestAnimationFrame(function() { panel.draw(); });
    }

    // step the muse
    step() {
	this.state.step();
	// and step the slaves
	for (var i = 0; i < this.slaveWindows.length; i++) {
	    this.slaveWindows[i].muse.slaveStep(1 & this.state.count32);
	}
	this.playNote();
	this.draw();
	// if a slave, reset the clock divider
	this.slaveClockDivider = 0;
    }

    // step a slave Muse, called from the master
    // clock is the rightmost bit of the master's state.count32 
    slaveStep(clock) {
	// need to be in AUTO 
	if (0 === this.state.auto) {
	    this.slaveClockDivider += 1;
	    if (1 === this.slaveMode) {
		// same clock rate, reflect the clock on C 1/2
		if (clock !== (1 & this.state.count32)) {
		    this.step();
		}
	    } else if (0 === this.slaveMode % 2) {
		// even number, line up clock 0
		if (0 === clock) {
		    if (this.slaveMode <= this.slaveClockDivider) {
			this.step();
		    }
		}
	    } else {
		// odd number
		if (this.slaveMode <= this.slaveClockDivider) {
		    this.step();
		}
	    }
	}
    }

    // called by the slave's index.html to set the counter divide-by mode.
    setTempoDivider(ev) {
	this.slaveMode = parseInt(event.target.value);
    }

    playNote() {
	var pitch = this.state.getPitch();
	var freq = 0;

	// null would be a rest
	if (null != pitch) {
	    // major scale, front panel pitch knob
	    freq = 880 * Math.pow(2, (pitch - this.state.pitch) / 12);
	    // add a little detuning for slaved Muses
	    if (this.slaveMode) {
		freq += 0.4 * (Math.random() - 0.5);
	    }
	}
	this.audio.playNote(freq, this.state.getGain());
    }

    // return the value of the pitch control as an integer, 0 is the center C.
    pitchControl() {
    }

    // in mSec per tick
    tempoControlValue() {
	return 0.5 * (100 + Math.pow(this.state.tempo, 2));
    }
	

    // call this when we change the tempo or go between run and hold
    updateTimer() {
	this.audio.assureContext();
	if (this.timer) {
	    clearTimeout(this.timer);
	    this.timer = null;
	}
	var muse = this;
	function stepFunction() {
	    // if we're in "hold", and the C 1/2 bit is 1, don't continue
	    if (1 == muse.state.auto && 1 == (1 & muse.state.count32)) {
		if (muse.timer) {
		    clearTimeout(muse.timer)
		    muse.timer = null;
		}
	    } else {
		muse.step();
	    }
	}

	// "auto" mode, not "off", 
	if ((2 != this.state.start) && (0 == this.state.auto) && !this.slaveMode) {
	    // this.timer = setInterval(stepFunction, 0.5 * (50 + Math.pow(this.state.tempo, 2)));
	    this.timer = setInterval(stepFunction, this.tempoControlValue());
	}
    }

    // Preset of the form: "a b c d w x y z rest"
    preset(text) {
	var vals = text.trim()
	    .toUpperCase()
	    .split(/\s+/)
	    .map(function (a) {return ('C1/2' == a) ? 'C 1/2' : a;});
	this.state.preset(vals.slice(0, 4), vals.slice(4, 8), vals[8]);
        // start playing
        this.state.start = 1;
        this.state.auto = 0;
        this.updateTimer();
    }

    // span a child muse
    spawn() {
	if (this.slaveMode) {
	    // tell the master
	    window.opener.muse.spawn();
	} else {
	    this.slaveCount += 1;
	    var slaveWindow = window.open(window.location.href,
					  'Muse Slave ' + this.slaveCount,
					  'width: 850, height: 850');
	    this.slaveWindows.push(slaveWindow);
	    this.draw();
	}
    }

    // called by the slave window to the master when closed
    // called by the master to the slave when closed
    unplug(w) {
	if (this.slaveMode) {
	    this.slaveMode = false;
	} else {
	    var i = this.slaveWindows.indexOf(w);
	    if (-1 !== i) {
		this.slaveWindows.splice(i, 1);
	    }
	}
	this.draw();
    }
}

// The state of the Muse.  
class MuseState {
    constructor(muse) {
	this.muse = muse;

	// switches top:
	// 0: start, 1: on, 2: off
	this.start = 2;
	// 0: auto, 1: hold, 2: step
	this.auto = 0;
	// 0: rest, 1: normal
	this.rest = 1;
	// switches below:
	// 0 (high) to 49 (low)
	this.volume = 20;
	this.tempo = 25;
	this.pitch = 33;
	this.theme = [0, 0, 0, 0];
	this.interval = [0, 0, 0, 0];

	this.majorScale = [0, 2, 4, 5, 7, 9, 11, 12];

	this.reset();
    }

    // copy the interesting stuff from another state into this one
    copy(state) {
	this.rest = state.rest;
	this.pitch = state.pitch;
	this.theme = state.theme.slice();
	this.interval = state.interval.slice();
    }
	
    reset() {
	this.count32 = 1;
	this.count6 = 0;
	this.shiftregister = 0;

	// reset the history to two eighth notes at the current pitch
	var pitch = this.getPitch();
	this.currentBar = [pitch, pitch];
	this.historyBars = [];
    }

    // gets a value from the state for a slider
    // if the value ends in a digit, use that 
    getValue(name) {
	var d = parseInt(name.slice(-1));
	if (isNaN(d)) {
	    return this[name];
	} else {
	    return this[name.slice(0, -1)][d];
	}
    }


    setValue(name, val) {
	var d = parseInt(name.slice(-1));
	if (isNaN(d)) {
	    this[name] = val;
	} else {
	    this[name.slice(0, -1)][d] = val;
	}
    }	

    // returns 0..15, or null for a rest
    getPitch() {
	// in the Muse, CBA address into a major scale, 0..7, and D raises it an octave
	// so the octave C note gets repeated
	var dcba = this.getNoteBits();
	var pitch = this.majorScale[0x7 & dcba] + 12 * (dcba >> 3);

	// rest switch
	if (0 === pitch && 0 === this.rest) {
	    pitch = null;
	}
	return pitch;
    }

    // return the value for one of the 40 position switches from the state
    //
    // i is between 0 and 39.
    select(i) {
	if (0 == i) {
	    // bit 0 is "off"
	    return 0;
	} else if (1 == i) {
	    // bit 1 is "on"
	    return 1;
	} else if (i < 7) {
	    // bits 2..6 are "C 1/2 to C8"
	    return 0x1 & (this.count32 >> (i - 2));
	} else if (i < 9) {
	    // bits 7,8 are from the divide-by-6, bits 2,3
	    return 0x1 & (this.count6 >> (i - 5));
	} else if (i < 40) {
	    // bits 9..39 are the shift register
	    return 0x1 & (this.shiftregister >> (i - 9));
	}
    }
    
    // advances the state one click
    // looks up the note from the interval switches
    // handles the rest switch
    // places note on history
    // returns the note, 0 to 15, or null for rest
    step() {
	//var pitchHistoryMax = 133;
	var pitchHistoryMax = 2000;
	

	// advance the state 
	this.click();

	var pitch = this.getPitch();

	// place note on history
	this.currentBar.push(pitch);
	return pitch;
    }

    // advances the 5-bit binary counter, the divide-by-6 counter,
    // and the shift register
    click() {
	// get the XNOR value for the shift register from the previous state
	// (need to double check this behavior with a real Muse)
	var newbit = 1;
	for (var i = 0; i < 4; i++) {
	    newbit ^= this.select(this.theme[i]);
	}

	// increment the 5-bit counter
	// bit 0 is "C 1/2" which is the clock signal in the actual Muse
	this.count32 = 0x1f & (this.count32 + 1);

	// the clock signal going zero triggers the divide-by-6 counter
	// and the shift register
	if (0 == (this.count32 & 0x1)) {

	    // divide-by-6:
	    // bits 0,1  count 0,1,3,...
	    // read from bits 2,3
	    this.count6 += 1;
	    if (0x2 == (this.count6 & 0x3)) {
		this.count6 += 1;
	    }
	    
	    // and the shift register
	    this.shiftregister = (this.shiftregister << 1) | newbit;
	}
    }

    // Return the current 4-bit value of the note selected by the interval
    // switches.
    getNoteBits() {
	var dcba = 0;
	for (var i = 0; i < 4; i ++) {
	    dcba |= this.select(this.interval[i]) << i;
	}
	return dcba;
    }

    // return the gain value, 0.0 to 1.0.
    getGain() {
	if  (2 == this.start) {
	    return 0;
	} else {
	    return 0.01 * (49 - this.volume);
	}
    }

    // preset to a "composition"
    preset(interval, theme, rest) {
        var sliderRows = this.muse.sliderRows;
        function rowVal(rowName) {
            var val = sliderRows.indexOf(rowName);
            if (-1 === val) {
                alert('bad row arg: ' + rowName);
                val = 0;
            }
            return val;
        }
        this.interval = interval.map(rowVal);
        this.theme = theme.map(rowVal);
	this.rest = ('REST' != rest);
	this.reset();
	this.muse.draw();
    }
}

// the graphic presentation of the Muse
class MusePanel {
    constructor(muse) {
	this.muse = muse;

	// create the canvas and insert it into the DOM
	var canvas = document.createElement('canvas');
	this.canvas = canvas;
	canvas.width = 820;
	canvas.height = 820;
	muse.div.appendChild(canvas);
	muse.scale = 1;

	this.matrix_left = 245;
	this.matrix_top = 150;
	this.matrix_rowHeight = 16;
	this.matrix_lampCol = this.matrix_left + 520;
        this.topLampRow = this.matrix_top - 36;

	this.matrix_intervalCol = this.matrix_left + 70;
	this.matrix_themeCol = this.matrix_left + 280;

	this.controls_top = 360;
	// muse blue
	this.color =  '#2255cc';
	// this.altBackground = '#cccccc';
	this.altBackground = '#99999999';

	// mode for the piano roll notation, 'music' or 'playerpiano'
	this.notation = 'music';
	this.setupSliders();

	// load art
	// build background image
	// call Muse's init() when done
	var panel = this;
	var imageCount = 2;
	function imageLoad() {
	    imageCount--;
	    if (0 === imageCount) {
		panel.drawBackground();
		panel.background = new Image();
		panel.background.addEventListener('load', function() {muse.init();});
		panel.background.src = canvas.toDataURL();
	    }
	}
	this.cabinetWood = new Image();
	this.cabinetWood.addEventListener('load', imageLoad);

	this.aluminum = new Image();
	this.aluminum.addEventListener('load', imageLoad);

	this.cabinetWood.src = './images/walnut.png';
	this.aluminum.src = './images/aluminum.png';
    }

    setupSliders() {
	// last slider that was clicked on
	this.clicked = null;

	var col1 = 60;
	var col2 = col1 + 60;
	var col3 = col2 + 60;
	var rowm = this.matrix_top;
	var rows = 240;
	var rowc = this.controls_top;
	var icol = this.matrix_intervalCol;
	var tcol = this.matrix_themeCol;

	var muse = this.muse;

	// create a getter, setter function pair
	function gs(name) {
	    return [
		function() {
		    return muse.state.getValue(name);
		},
		function(val) {
		    muse.state.setValue(name, val);
		}];
	}

	this.sliders = {
	    //                     n, dy,  [get(), set()],             labels,    x,         y
	    start:     new Slider( 3, 20,     gs('start'),  'START\nRUN\nOFF', col1,       rows),
	    auto:      new Slider( 3, 20,      gs('auto'), 'AUTO\nHOLD\nSTEP', col2,       rows),
	    rest:      new Slider( 2, 20,      gs('rest'),     'REST\nNORMAL', col3,       rows),
	    volume:    new Slider(50,  4,    gs('volume'),           'VOLUME', col1,       rowc),
	    tempo:     new Slider(50,  4,     gs('tempo'),            'TEMPO', col2,       rowc),
	    pitch:     new Slider(50,  4,     gs('pitch'),            'PITCH', col3,       rowc),

	    intervala: new Slider(40, 16, gs('interval0'),                'A', icol,       rowm),
	    intervalb: new Slider(40, 16, gs('interval1'),                'B', icol + 50,  rowm),
	    intervalc: new Slider(40, 16, gs('interval2'),                'C', icol + 100, rowm),
	    intervald: new Slider(40, 16, gs('interval3'),                'D', icol + 150, rowm),
	    themew:    new Slider(40, 16,    gs('theme0'),                'W', tcol,       rowm),
	    themex:    new Slider(40, 16,    gs('theme1'),                'X', tcol + 50,  rowm),
	    themey:    new Slider(40, 16,    gs('theme2'),                'Y', tcol + 100, rowm),
	    themez:    new Slider(40, 16,    gs('theme3'),                'Z', tcol + 150, rowm)};

	// start switch side effects
	this.sliders.start.operation = function(val) {
	    muse.updateTimer();
	    if (0 === val) {
		// "start" position
		muse.state.reset();
	    }
	};

	// start switch momentary up
	this.sliders.start.onRelease = function() {
	    if (0 == muse.state.start) {
		muse.state.start = 1;
	    }
	    muse.playNote();
	    muse.draw();	    
	};

	// auto switch side effects
	this.sliders.auto.operation = function(val) {
	    // 0: run, 1: hold, 2: single-step
	    if (0 == val) {
		muse.updateTimer();
	    }
	    else if (2 == val) {
		muse.step();
	    }
	};

	// auto switch, step is momentary
	this.sliders.auto.onRelease = function() {
	    if (2 == muse.state.auto) {
		muse.state.auto = 1;
		if (0 == (1 & muse.state.count32)) {
		    muse.step();
		}
	    }
	    muse.draw();
	};

	// volume
	this.sliders.volume.operation = function(val) {
	    muse.playNote();
	};

	// pitch
	this.sliders.pitch.operation = function(val) {
	    muse.playNote();
	};

	this.sliders.pitch.displayValue = function(val) {
	    var scale = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
	    var i = ((33 - val) % 12 + 12) % 12;
	    return scale[i];
	}

	// tempo
	this.sliders.tempo.operation = function(val) {
	    muse.updateTimer();
	};

	this.sliders.tempo.displayValue = function(val) {
	    // mSec to BPM, divided by 2
	    return Math.round(30 * 1000 / muse.tempoControlValue()) + " BPM";
	}

	var canvas = this.canvas;
	var panel = this;

	// mouse and touch event listeners 
	canvas.addEventListener(
	    'mousedown',
	    function (e) {
		panel.pointerStart(e.pageX, e.pageY);
	    });

	canvas.addEventListener(
	    'touchstart',
	    function(e) {
		e.preventDefault();
		panel.pointerStart(e.targetTouches[0].pageX, 
				  e.targetTouches[0].pageY);
	    });
	
	canvas.addEventListener(
	    'mouseup',
	    function (e) {
		panel.pointerEnd();
	    });

	canvas.addEventListener(
	    'touchend',
	    function(e) {
		panel.pointerEnd();
	    });

	canvas.addEventListener(
	    'mousemove',
	    function (e) {
		panel.pointerMove(e.pageX, e.pageY);
	    });

	canvas.addEventListener(
	    'touchmove',
	    function(e) {
		e.preventDefault();
		panel.pointerMove(e.targetTouches[0].pageX, 
				 e.targetTouches[0].pageY);
	    });
    }

    // handle mouse/touch start
    pointerStart(x, y) {
	x = (x - this.canvas.offsetLeft) / this.muse.scale;
	y = (y - this.canvas.offsetTop) / this.muse.scale;

	// find a matching slider
	for (var key in this.sliders) {
	    if (!this.sliders.hasOwnProperty(key)) {
		continue;
	    }
	    var slider = this.sliders[key];
	    var hit = slider.click(x, y);
	    if (hit) {
		this.muse.audio.assureContext();
		this.muse.draw();
		this.clicked = slider;
		break;
	    }
	}
    }

    // handle mouse/touch end
    pointerEnd() {
	if (this.clicked) {
	    this.clicked.onRelease();
	}
	this.clicked = null;
    }

    // handle mouse/touch move
    pointerMove(x, y) {
	if (this.clicked) {
	    x = (x - this.canvas.offsetLeft) / this.muse.scale;
	    y = (y - this.canvas.offsetTop) / this.muse.scale;
	    var val = this.clicked.mouseOver(x, y);
	    if (null != val) {
		var oldval = this.clicked.getter()
		if (val != oldval) {
		    this.clicked.setter(val);
		    this.clicked.operation(val);
		    this.muse.playNote();
		    this.muse.draw();
		}
	    }
	}
    }

    draw() {
	// draw background image
	var ctx = this.canvas.getContext('2d');
	ctx.drawImage(this.background, 0, 0);

	// draw Master/Slave
	ctx.font = '16px sans-serif';
	ctx.fillStyle = '#dddddd';
	if (this.muse.slaveWindows.length) {
	    ctx.fillText('Master of ' + this.muse.slaveWindows.length, 5, 18);
	} else if (this.muse.slaveMode) {
	    ctx.fillText('Slave', 5, 18);
	}
	

	// draw the lamps on the right
	var sliderRows = this.muse.sliderRows;
	for (var i = 0; i < sliderRows.length; i++) {
	    var y = this.matrix_top + i * this.matrix_rowHeight;
	    if (this.muse.state.select(i)) {
		ctx.fillStyle = lampColor(i);
		ctx.fillRect(this.matrix_lampCol - 6, y + 2, 12, 12);
	    }
	}

	// draw the 6 sliders on the left
	for (var key in this.sliders) {
	    if (!this.sliders.hasOwnProperty(key)) {
		continue;
	    }
	    // handle slave case here
	    if (!this.muse.slaveMode || ('tempo' !== key)) {
		this.sliders[key].draw(ctx, this.muse.state);
	    }
	}

	// music and lightshow
	if ('music' == this.notation) {
	    this.drawMelodyMusicNotation(ctx);
	} else {
	    this.drawMelodyPianoRoll(ctx);
	}
	this.drawLightShow(ctx);
    }

    drawBackground(ctx) {

	var canvas = this.canvas;
	var ctx = canvas.getContext('2d');
	var width = this.canvas.width;
	var height = this.canvas.height;

	ctx.drawImage(this.aluminum, 0, 0);

	// walnut image on top and bottom
	// (vertical offset so the grains are differnet)
	// (that's really waxing it, isn't it?)
	var thick = 24;
	var img = this.cabinetWood;
	ctx.drawImage(img, 0, 0, width, thick);
	ctx.drawImage(img,
		      0, img.height - thick, img.width, thick,
		      0, height - thick, width, thick);


	ctx.font = '11px sans-serif';
	this.drawMatrix(ctx);
	this.drawControls(ctx);

	ctx.fillStyle = this.color;
	ctx.font = '16px sans-serif';
	ctx.fillText('TRIADEX          THE MUSE', 20, 100);
	this.drawLogo(ctx);
    }

    drawLogo(ctx) {
	// height
	var h = 70;
	// half width
	var w = 0.3 * h;
	// top radius
	var r1 = 0.15 * h;
	var r2 = 0.62 * h;
	ctx.save();
	ctx.translate(120, 120);
	ctx.lineWidth = 0.06 * h;
	// color needs to be lighter
	ctx.strokeStyle = '#6699f8';
	ctx.fillStyle = '#6699f8';

	// outline
	ctx.beginPath();
	ctx.moveTo(-w, h);
	ctx.lineTo(w, h);
	ctx.lineTo(w, r1);
	ctx.arc(w - r1, r1, r1, 0, -0.5 * Math.PI, true);
	ctx.arc(-w + r1, r1, r1, -0.5 * Math.PI, Math.PI, true);
	ctx.closePath();
	ctx.stroke();

	// slopey things
	var sy = 0.46 * h;
	ctx.beginPath();
	ctx.moveTo(-w, sy);
	ctx.arc(w, sy, 2 * w, Math.PI, 0.75 * Math.PI, true);
	ctx.arc(-w, sy, 2 * w, 0.25 * Math.PI, 0, true);
	ctx.stroke();

	// arms
	var ay = 0.45 * h;
	var ao = 0.78 * w;
	var ai = 0.13 * w;
	var r3 = 4;
	var av = 18;
	ctx.beginPath();
	ctx.moveTo(-ao, ay);
	ctx.lineTo(-ai - r3, ay);
	ctx.arc(-ai - r3, ay + r3, r3, -0.5 * Math.PI, 0);
	ctx.lineTo(-ai, ay + av);
	ctx.moveTo(ao, ay);
	ctx.lineTo(ai + r3, ay);
	ctx.arc(ai + r3, ay + r3, r3, -0.5 * Math.PI, Math.PI, true);
	ctx.lineTo(ai, ay + av);
	ctx.stroke();

	// dots
	function dot(x, y) {
	    var r = 0.05 * h;
	    ctx.beginPath();
	    ctx.moveTo(x + r, y);
	    ctx.arc(x, y, r, 0, 2 * Math.PI);
	    ctx.fill();
	}
	dot(0, 0.18 * h);
	dot(-0.2 * w, 0.28 * h);
	dot(0.2 * w, 0.28 * h);	
	ctx.restore();
	
    }

    drawMatrix(ctx) {
	var head = 50;
	var matrix_width = 550;
	var matrix_left = this.matrix_left;
	var matrix_top = this.matrix_top;
	var labelLeft = matrix_left + 15;
	var labelRight = matrix_left + 460;
        var lampBackground = '#666666';

	ctx.strokeStyle = this.color;
	ctx.strokeRect(matrix_left, matrix_top - head,
		       matrix_width, 40 * this.matrix_rowHeight + head);

        var panel = this;
	function header(label, s1, s2) {
	    var tw = ctx.measureText(label).width;
	    var left = s1.x - 10;
	    var right = s2.x + 10;
	    var center = 0.5 * (left + right);
	    var y1 = matrix_top - 20;
	    var y2 = matrix_top - 10;

	    ctx.beginPath();
	    ctx.moveTo(left, y2);
	    ctx.lineTo(left, y1);
	    ctx.lineTo(center - 0.5 * tw - 10, y1);	
	    ctx.moveTo(right, y2);
	    ctx.lineTo(right, y1);
	    ctx.lineTo(center + 0.5 * tw + 10, y1);
	    ctx.stroke();
	    ctx.fillText(label, center - 0.5 * tw, y1 + 4);

            // background for the top row of lamps
            ctx.fillStyle = lampBackground;
            ctx.fillRect(left, panel.topLampRow - 4, right - left, 8);
	}	
	ctx.strokeStyle = this.color;
	ctx.fillStyle = this.color;
	header('INTERVAL', this.sliders.intervala, this.sliders.intervald);
	header('THEME', this.sliders.themew, this.sliders.themez);

	var lines = [2, 9, 13, 17, 21, 25, 29, 33, 37];
	var sliderRows = this.muse.sliderRows;
	for (var i = 0; i < sliderRows.length; i++ ) {
	    ctx.strokeStyle = this.color;
	    var y = matrix_top + i * this.matrix_rowHeight;
	    if (!(i % 2)) {
		ctx.fillStyle = this.altBackground;
		ctx.fillRect(matrix_left + 2, y, matrix_width - 4, this.matrix_rowHeight);
	    }
	    if (-1 < lines.indexOf(i)) {
		ctx.beginPath();
		ctx.moveTo(matrix_left, y);
		ctx.lineTo(matrix_left + matrix_width, y);
		ctx.stroke();
	    }
	    ctx.fillStyle = this.color;
	    ctx.fillText(sliderRows[i], labelLeft, y + 11);
	    ctx.fillText(sliderRows[i], labelRight, y + 11);
	}

	// lamps column
	ctx.fillStyle = lampBackground;
	ctx.fillRect(this.matrix_lampCol - 8, matrix_top, 16, 40 * this.matrix_rowHeight);
    }

    // the art behind the second row of controls
    drawControls(ctx) {
	var h = 205 / 9.0;

	for (var i = 0; i < 9; i++) {
	    var y = this.controls_top + i * h;
	    if (!(i % 2)) {
		ctx.fillStyle = this.altBackground;
		ctx.fillRect(20, y, 200, h);
	    }
	    ctx.fillStyle = this.color;
	    ctx.fillText('' + (8 - i), 24, y + 14);
	}
    }

    drawMelodyMusicNotation(octx) {
	// convert note number to key string
	var scale = 'c.d.ef.g.a.b';

	// convert number of eighth notes to duration spec
	var durations = [null, '8', 'q', 'q', 'h', null, 'h', 'h', 'w'];
	
	function toKey(note) {
	    if (null == note) {
		return 'b/4';
	    }
	    return scale[note % 12] + '/' + (4 + Math.floor(note / 12));
	}

	var VF = Vex.Flow;
	var renderer = new VF.Renderer(octx.canvas, VF.Renderer.Backends.CANVAS);
	var ctx = renderer.getContext();

	ctx.save();
	ctx.fillStyle = '#333333';
	ctx.strokeStyle = '#333333';
	ctx.scale(0.6, 0.6);

	var staveCount = 0;
	var staveX = 20;
	var fillWidth = 1220;

	// calculate width in pixels from the number of notes
	function staveWidth(notes) {
	    return 40 + 16 * notes.length;
	}

	function drawStave(notes) {
	    // draw the stave
	    var width = staveWidth(notes);
	    if (0 == staveCount) {
		width += 60;
	    }
	    var stave = new VF.Stave(staveX, 36, width);
	    if (0 == staveCount) {
		stave.addClef("treble");
		stave.addTimeSignature("4/4");
	    }
	    stave.setContext(ctx).draw();

	    // draw the notes and the beams
	    if (notes) {
		var beams = VF.Beam.generateBeams(notes);
		VF.Formatter.FormatAndDraw(ctx, stave, notes);
		beams.forEach(function(b) { return b.setContext(ctx).draw()});
	    }
	    staveCount += 1;
	    staveX += width;
	}
	// do the previous bars
	this.muse.state.historyBars.forEach(drawStave);

	// do the current bar
	var bar = this.muse.state.currentBar.slice(0);
	var full = 8 <= bar.length;
	if (full) {
	    bar = this.muse.state.currentBar.splice(0, 8);
	}
	
	var barNotes = [];
	while (bar.length) {
	    // l is the length of the first note
	    var l = bar.findIndex(function (a) {return a != bar[0]});
	    // -1 means they're all the same
	    if (-1 == l) {
		l = bar.length;
	    }
	    // 
	    if (5 == l) {
		l = 4;
	    }
	    var dur = durations[l];
	    if (null == bar[0]) {
		dur += 'r';
	    }
	    const keys = [toKey(bar[0])];

	    var staveNote = new VF.StaveNote({clef: 'treble',
					      keys: keys,
					      duration: dur});
	    if (3 == l | 6 == l | 7 == l) {
		staveNote.addDotToAll();
	    }
	    if (7 == l) {
		staveNote.addDotToAll();
	    }
	    barNotes.push(staveNote);
	    // shift'm out
	    bar = bar.slice(l);
	}
	if (barNotes.length) {
	    drawStave(barNotes);
	    if (full) {
		// full bar, move it to the history bars
		this.muse.state.historyBars.push(barNotes);

		// trim as much off as necessary
		while (fillWidth < staveX) {
		    staveX -= staveWidth(this.muse.state.historyBars.shift());
		}
	    }
	}
	if (!staveCount) {
	    drawStave();
	}

	ctx.restore();
    }

    ////////////////////////////////////////////////////////////////
    drawLightShow(ctx) {
	var lightshowRad = 250;
	var dcba = this.muse.state.getNoteBits();
	var l = 5, t = 590, w = 236, h = 200;
	var p = 50;

	// older javasscript can't handle #rrggbbaa color
	function bulb(color, x, y) {
	    var g = ctx.createRadialGradient(x, y, lightshowRad, x, y, 0);
	    g.addColorStop(0, 'rgba(' + color + ', 0)');
	    g.addColorStop(1, 'rgba(' + color + ', 1)');
	    ctx.fillStyle = g;
	    ctx.fillRect(l, t, w, h);
	}

	ctx.fillStyle = '#333333';
	ctx.fillRect(l, t, w, h);
	ctx.globalCompositeOperation = 'screen';
	if (dcba & 0x1) {
	    //bulb('#f83333', l + p, t + p);
	    //bulb('#e82323', l + p, t + p);
	    bulb('232, 35, 35', l + p, t + p);
	}
	if (dcba & 0x2) {
	    //bulb('#f0e833', l + w - p , t + p);
	    //bulb('#e0d823', l + w - p , t + p);
	    bulb('224, 216, 35', l + w - p , t + p);
	}
	if (dcba & 0x4) {
	    // bulb('#33f833', l + p, t + h - p);
	    //bulb('#23e823', l + p, t + h - p);
	    bulb('35, 232, 35', l + p, t + h - p);
	}
	if (dcba & 0x8) {
	    // bulb('#3333ff', l + w - p, t + h - p);
	    // bulb('#2323ef', l + w - p, t + h - p);
	    bulb('35, 35, 239', l + w - p, t + h - p);
	}
	ctx.globalCompositeOperation = 'source-over';
    }    
}

// Slider Switch Class

class Slider {
    constructor(n, dy, getterAndSetter, labels, x, y) {
	this.n = n;
	this.dy = dy;
	this.labels = labels.split('\n');
	this.x = x;
	this.y = y;
	this.getter = getterAndSetter[0];
	this.setter = getterAndSetter[1];
	// side effecting operation
	this.operation = function() {};
	// called when the mouse button is released
	this.onRelease = function() {};
	this.displayValue = null;
	this.paddleHeight = 8;
	// the space the paddle overhangs
	this.endSpace = Math.max(0, 0.5 * (this.paddleHeight - this.dy));
    }

    draw(ctx, state) {
	// draw labels
	ctx.font = '11px sans-serif';
	ctx.fillStyle = '#3366dd';

	// draw 1, 2, or 3 labels on the top, possibly middle, possibly bottom
	var slider = this;
	function drawLabel(label, align, rely) {
	    var width = ctx.measureText(label).width;
	    var offsetx = ('left' == align) ? (-width - 12) : (-0.5 * width);
	    ctx.fillText(label, slider.x + offsetx, slider.y + rely);
	}
	drawLabel(this.labels[0], 'center', - 4);
	var height = this.n * this.dy;
	if (2 === this.labels.length) {
	    drawLabel(this.labels[1], 'center', height + 12);
	} else if (3 === this.labels.length) {
	    drawLabel(this.labels[1], 'left', 0.5 * height);	    
	    drawLabel(this.labels[2], 'center', height + 12);	
	}	    
	
	// draw track
	ctx.fillStyle = '#eeeeee';
	ctx.fillRect(this.x - 2, this.y, 4, this.n * this.dy + 2 * this.endSpace);
	ctx.strokeStyle = '#444444';
	ctx.strokeRect(this.x - 2, this.y, 4, this.n * this.dy + 2 * this.endSpace);
	

	// paddle position
	var yy = this.y + this.endSpace + (this.getter() + 0.5) * this.dy;

	// drop shadow
	ctx.fillStyle = 'rgba(128,128,128,0.5)';
	ctx.fillRect(this.x - 11, yy - 0.5 * this.paddleHeight, 23, this.paddleHeight + 3);

	// paddle
	ctx.strokeStyle = '#000000';
	ctx.fillStyle = '#333333';
	ctx.fillRect(this.x - 10, yy - 0.5 * this.paddleHeight, 20, this.paddleHeight);
	ctx.strokeRect(this.x - 10, yy - 0.5 * this.paddleHeight, 20, this.paddleHeight);
        
        var topRow = -36;
	// glow light
	if (40 == this.n) {
	    var v = this.getter();
	    if (state.select(v)) {
		var r = 3.5;
		ctx.beginPath();
		ctx.moveTo(this.x + r, yy);
		ctx.arc(this.x, yy, r, 0, 2 * Math.PI);
		ctx.fillStyle = lampColor(v);
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(this.x + r, this.y + topRow);
		ctx.arc(this.x, this.y + topRow, r, 0, 2 * Math.PI);
		ctx.fill();
	    }
	}
	if (this.displayValue) {
	    var text = this.displayValue(this.getter());
	    ctx.fillStyle = '#3366dd';
	    var width = ctx.measureText(text).width;
	    ctx.fillText(text, this.x - 0.5 * width, this.y - 16);
	}
    }

    click(x, y) {
	var val = this.mouseOver(x, y);
	if (null !== val) {
	    this.setter(val);
	    this.operation(val);
	    return true;
	}
	return false;
    }

    // is the mouse over this slider?
    // if so, return the value (0..n-1)
    // else return null
    mouseOver(x, y) {
	// x range
	if (((this.x - 15) <= x) && (x <= (this.x + 15))) {
	    var start = this.y + this.endSpace;
	    if (start <= y) {
		var val = Math.floor((y - start) / this.dy)
		if (val < this.n) {
		    return val;
		}
	    }
	}
	return null;
    }
}

class MuseAudio {
    constructor() {
	this.actx = null;
	this.osc = null;
	this.vca = null;
    }

    // needs to be called by mousedown to create the audio context
    assureContext() {
	if (!this.actx) {
	    this.actx = new (window.AudioContext || window.webkitAudioContext)();    

	    // limited harmonic content square wave
	    var wave = this.actx.createPeriodicWave(
		new Float32Array([0.0, 1.0, 0.0, 0.333, 0.0, 0.2, 0.0, 0.15, 0.0, 0.11]),
		new Float32Array([0.0, 0.0, 0.0, 0.0,   0.0, 0.0, 0.0, 0.0,  0.0, 0.0 ]));

	    this.osc = this.actx.createOscillator();
	    this.osc.setPeriodicWave(wave);
	    this.vca = this.actx.createGain();
	    this.osc.connect(this.vca);
	    this.vca.connect(this.actx.destination);
	    this.vca.gain.value = 0;
	    this.osc.start(this.actx.currentTime);
	}
    }

    playNote(freq, gain) {
	if (this.actx) {
	    this.vca.gain.value = gain;
	    this.osc.frequency.setValueAtTime(freq, this.actx.currentTime);
	}
    }
}

//var muse;
// the Muse instance is now window.muse so we can communicate between windows.

// top level function called when page is loaded
// supply the canvas id and, optionally, the presets table id
function muse(museDivId, presetsDivId) {
    window.muse = new Muse(museDivId, presetsDivId);
}
