// Triadex Muse in Javascript
//
// Copyright 2017, J. Donald Tillman.  All rights reserved.
//
// The actual Muse was invented in 1969 by Marvin Minsky and Edward Fredkin at MIT.
// http://www.till.com/articles/muse

// My interpretation of how the C 1/2 works with single step.
//    * reset leaves C 1/2 in a one state
//    * hold  leaves C 1/2 in a one state
//    * hitting single-step drives C 1/2 low when you click,
//    * back up to high when you let go

class Muse {
    constructor(canvasId) {
	this.canvas = document.querySelector('#' + canvasId);
	this.state = new MuseState(this);
	this.panel = new MusePanel(this);
	this.audio = new MuseAudio();
	this.timer = null;

	this.setupSliders();
	this.draw();
    }

    setupSliders() {
	// last slider that was clicked on
	this.clicked = null;

	this.sliderRows = ['OFF', 'ON', 'C 1/2', 'C1', 'C2', 'C4', 'C8', 'C3', 'C6'];
	for (var i = 1; i <= 31; i++) {
	    this.sliderRows.push('B' + i);
	}
	var col1 = this.panel.switchesx;
	var col2 = col1 + 60;
	var col3 = col2 + 60;
	var row1 = this.panel.switchesy;
	var row2 = row1 + 120;
	var icol = this.panel.matrix_intervalCol
	var tcol = this.panel.matrix_themeCol

	var muse = this;

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
	    start:     new Slider( 3, 20,     gs('start'),  'START\nRUN\nOFF', col1,      row1),
	    auto:      new Slider( 3, 20,      gs('auto'), 'AUTO\nHOLD\nSTEP', col2,      row1),
	    rest:      new Slider( 2, 20,      gs('rest'),     'REST\nNORMAL', col3,      row1),
	    volume:    new Slider(50,  4,    gs('volume'),           'VOLUME', col1,      row2),
	    tempo:     new Slider(50,  4,     gs('tempo'),            'TEMPO', col2,      row2),
	    pitch:     new Slider(50,  4,     gs('pitch'),            'PITCH', col3,      row2),
	    intervala: new Slider(40, 16, gs('interval0'),                'A', icol,      row1),
	    intervalb: new Slider(40, 16, gs('interval1'),                'B', icol + 30, row1),
	    intervalc: new Slider(40, 16, gs('interval2'),                'C', icol + 60, row1),
	    intervald: new Slider(40, 16, gs('interval3'),                'D', icol + 90, row1),
	    themew:    new Slider(40, 16,    gs('theme0'),                'W', tcol,      row1),
	    themex:    new Slider(40, 16,    gs('theme1'),                'X', tcol + 30, row1),
	    themey:    new Slider(40, 16,    gs('theme2'),                'Y', tcol + 60, row1),
	    themez:    new Slider(40, 16,    gs('theme3'),                'Z', tcol + 90, row1)};

	// start switch side effects
	this.sliders.start.operation = function(val) {
	    muse.updateTimer();
	    if (0 === val) {
		// "start" position
		muse.state.reset();
	    }
	}

	// start switch momentary up
	this.sliders.start.onRelease = function() {
	    if (0 == muse.state.start) {
		muse.state.start = 1;
	    }
	    muse.playNote();
	    muse.draw();	    
	}

	// auto switch side effects
	this.sliders.auto.operation = function(val) {
	    // 0: run, 1: hold, 2: single-step
	    if (0 == val) {
		muse.updateTimer();
	    }
	    else if (2 == val) {
		muse.step();
	    }
	}

	// auto switch, step is momentary
	this.sliders.auto.onRelease = function() {
	    if (2 == muse.state.auto) {
		muse.state.auto = 1;
		if (0 == (1 & muse.state.count32)) {
		    muse.step();
		}
	    }
	    muse.draw();
	}

	// volume
	this.sliders.volume.operation = function(val) {
	    muse.playNote();
	}

	// pitch
	this.sliders.pitch.operation = function(val) {
	    muse.playNote();
	}

	// tempo
	this.sliders.tempo.operation = function(val) {
	    muse.updateTimer();
	}

	// mouse and touch event listeners 
	this.canvas.addEventListener(
	    'mousedown',
	    function (e) {
		muse.pointerStart(e.pageX, e.pageY);
	    });

	this.canvas.addEventListener(
	    'touchstart',
	    function(e) {
		e.preventDefault();
		muse.pointerStart(e.targetTouches[0].pageX, 
				  e.targetTouches[0].pageY);
	    });
	
	this.canvas.addEventListener(
	    'mouseup',
	    function (e) {
		muse.pointerEnd();
	    });

	this.canvas.addEventListener(
	    'touchend',
	    function(e) {
		muse.pointerEnd();
	    });

	this.canvas.addEventListener(
	    'mousemove',
	    function (e) {
		muse.pointerMove(e.pageX, e.pageY);
	    });

	this.canvas.addEventListener(
	    'touchmove',
	    function(e) {
		e.preventDefault();
		muse.pointerMove(e.targetTouches[0].pageX, 
				 e.targetTouches[0].pageY);
	    });
    }

    // handle mouse/touch start
    pointerStart(x, y) {
	x -= this.canvas.offsetLeft;
	y -= this.canvas.offsetTop;

	// find a matching slider
	for (var key in this.sliders) {
	    if (!this.sliders.hasOwnProperty(key)) {
		continue;
	    }
	    var slider = this.sliders[key];
	    var hit = slider.click(x, y);
	    if (hit) {
		this.audio.assureContext()
		this.draw();
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
	    x -= this.canvas.offsetLeft;
	    y -= this.canvas.offsetTop;
	    var val = this.clicked.mouseOver(x, y);
	    if (null != val) {
		var oldval = this.clicked.getter()
		if (val != oldval) {
		    this.clicked.setter(val);
		    this.clicked.operation(val);
		    this.playNote();
		    this.draw();
		}
	    }
	}
    }

    draw() {
	var ctx = this.canvas.getContext('2d');
	ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
	this.panel.draw(ctx);
	for (var key in this.sliders) {
	    if (!this.sliders.hasOwnProperty(key)) {
		continue;
	    }
	    this.sliders[key].draw(ctx, this.state);
	}
    }

    step() {
	this.state.step();
	this.playNote();
	this.draw();
    }

    playNote() {
	var pitch = this.state.getPitch();
	var freq = 0;

	// null would be a rest
	if (null != pitch) {
	    // major scale, front panel pitch knob
	    freq = 880 * Math.pow(2, (pitch - this.state.pitch) / 12);
	}
	this.audio.playNote(freq, this.state.getGain());
    }



    // call this when we change the tempo or go between run and hold
    updateTimer() {
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
	if ((2 != this.state.start) && (0 == this.state.auto)) {
	    this.timer = setInterval(stepFunction, 0.5 * (50 + Math.pow(this.state.tempo, 2)));
	}
    }
}

// The state of the Muse.  
class MuseState {
    constructor(muse) {
	this.muse = muse;
	this.count32 = 1;
	this.count6 = 0;
	this.shiftregister = 0;
	this.theme = [0, 0, 0, 0];
	this.interval = [0, 0, 0, 0];
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

	this.history = [];
	this.majorScale = [0, 2, 4, 5, 7, 9, 11, 12];
    }

    reset() {
	this.count32 = 1;
	this.count6 = 0;
	this.shiftregister = 0;
	this.history = [];
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
	var pitchHistoryMax = 133;

	// advance the state 
	this.click();

	var pitch = this.getPitch();

	// place note on history
	if (pitchHistoryMax < this.history.length) {
	    this.history.shift();
	}
	this.history.push(pitch);
	return pitch;
    }

    // advances the 5-bit binary counter, the divide-by-6 counter,
    // and the shift register
    click() {
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

	    // shift register, XNOR theme
	    var newbit = 1;
	    for (var i = 0; i < 4; i++) {
		newbit ^= this.select(this.theme[i]);
	    }
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
	function encodeQuad(quad) {
	    var result = [];
	    for (var i = 0; i < quad.length; i++) {
		var idx = sliderRows.indexOf(quad[i]);
		if (-1 == idx) {
		    alert('failed: ' + quad);
		    return;
		}
		result.push(idx);
	    }
	    return result;
	}
	this.interval = encodeQuad(interval);
	this.theme = encodeQuad(theme);
	this.rest = ('REST' != rest);
	this.reset();
	this.muse.draw();
    }
}

class MusePanel {
    constructor(muse) {
	this.muse = muse;
	this.matrix_left = 245;
	this.matrix_top = 150;

	this.matrix_intervalCol = this.matrix_left + 60;
	this.matrix_themeCol = this.matrix_left + 200;

	this.switchesx = 60;
	this.switchesy = 150;

	this.color = '#6666dd';
	this.altBackground = '#cccccc';
    }

    draw(ctx) {
	ctx.font = '10px sans-serif';
	this.drawMatrix(ctx);
	this.drawControls(ctx);
	this.drawMelodyPlot(ctx);
	this.drawLightShow(ctx);

	ctx.fillStyle = this.color;
	ctx.font = '16px sans-serif';
	ctx.fillText('THE MUSE', 80, 40);

    }

    drawMatrix(ctx) {
	var head = 40;
	var matrix_rowHeight = 16;
	var matrix_width = 440;
	var matrix_left = this.matrix_left;
	var matrix_top = this.matrix_top;

	ctx.strokeStyle = this.color;
	ctx.strokeRect(matrix_left, matrix_top - head,
		       matrix_width, 40 * matrix_rowHeight + head);

	function header(name, col0x) {
	    var tw = ctx.measureText(name).width;
	    var left = col0x - 10;
	    var right = col0x + 100;
	    var center = 0.5 * (left + right);
	    var y1 = matrix_top - 25;
	    var y2 = matrix_top - 15;

	    ctx.beginPath();
	    ctx.moveTo(left, y2);
	    ctx.lineTo(left, y1);
	    ctx.lineTo(center - 0.5 * tw - 10, y1);	
	    ctx.moveTo(right, y2);
	    ctx.lineTo(right, y1);
	    ctx.lineTo(center + 0.5 * tw + 10, y1);
	    ctx.stroke();
	    ctx.fillText(name, center - 0.5 * tw, y1);
	}	
	ctx.strokeStyle = this.color;
	ctx.fillStyle = this.color;
	header('INTERVAL', this.matrix_intervalCol);
	header('THEME', this.matrix_themeCol);

	var lines = [2, 9, 13, 17, 21, 25, 29, 33, 37];
	var sliderRows = this.muse.sliderRows;
	for (var i = 0; i < sliderRows.length; i++ ) {
	    ctx.strokeStyle = this.color;
	    var y = matrix_top + i * matrix_rowHeight;
	    if (!(i % 2)) {
		ctx.fillStyle = this.altBackground;
		ctx.fillRect(matrix_left + 2, y, matrix_width - 4, matrix_rowHeight);
	    }
	    if (-1 < lines.indexOf(i)) {
		ctx.beginPath();
		ctx.moveTo(matrix_left, y);
		ctx.lineTo(matrix_left + matrix_width, y);
		ctx.stroke();
	    }
	    ctx.fillStyle = this.color;
	    ctx.fillText(sliderRows[i], matrix_left + 15, y + 11);
	    ctx.fillText(sliderRows[i], matrix_left + 315, y + 11);
	}

	// lamps (heh, I originally called them LEDs)
	var lampCol = matrix_left + 380;
	ctx.fillStyle = '#555555';
	ctx.fillRect(lampCol - 4, matrix_top, 8, 40 * matrix_rowHeight);
	for (var i = 0; i < sliderRows.length; i++) {
	    var y = matrix_top + i * matrix_rowHeight;
	    if (this.muse.state.select(i)) {
		ctx.fillStyle = (i < 9) ? '#77bbff' : '#55ee55';
		ctx.fillRect(lampCol - 4, y + 2, 8, 8);
	    }
	}

    }

    // the art behind the second row of controls
    drawControls(ctx) {
	var row_c2 = 270;
	var h = 205 / 9.0;

	for (var i = 0; i < 9; i++) {
	    var y = row_c2 + i * h;
	    if (!(i % 2)) {
		ctx.fillStyle = this.altBackground;
		ctx.fillRect(20, y, 200, h);
	    }
	    ctx.fillStyle = this.color;
	    ctx.fillText('' + (8 - i), 24, y + 14);
	}
    }

    drawMelodyPlot(ctx) {
	var hx = 10;
	var hy = 102;
	var history = this.muse.state.history;
	ctx.strokeStyle = '#aa3355';
	ctx.lineWidth = 2;
	ctx.beginPath();
	for (var i = 0; i < history.length; i++) {
	    var x = hx + 5 * i;
	    var p = history[i];
	    if (null != p) {
		var y = hy - 4 * p;
		ctx.moveTo(x, y);
		ctx.lineTo(x + 5, y);
	    }
	}
	ctx.stroke();
	ctx.lineWidth = 1;
    }

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

	ctx.fillStyle = '#111111';
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
	this.paddleHeight = 8;
	// the space the paddle overhangs
	this.endSpace = Math.max(0, 0.5 * (this.paddleHeight - this.dy));


    }

    draw(ctx, state) {
	// draw labels
	ctx.font = '10px sans-serif';
	ctx.fillStyle = '#6666dd';

	// draw 1, 2, or 3 labels on the top, possibly middle, possibly bottom
	var slider = this;
	function drawLabel(label, align, rely) {
	    var width = ctx.measureText(label).width;
	    var offsetx = ('left' == align) ? (-width - 12) : (-0.5 * width);
	    ctx.fillText(label, slider.x + offsetx, slider.y + rely);
	}
	drawLabel(this.labels[0], 'center', - 8);
	var height = this.n * this.dy;
	if (2 === this.labels.length) {
	    drawLabel(this.labels[1], 'center', height + 12);
	} else if (3 === this.labels.length) {
	    drawLabel(this.labels[1], 'left', 0.5 * height);	    
	    drawLabel(this.labels[2], 'center', height + 12);	
	}	    
	
	// draw track
	ctx.strokeStyle = '#444444';
	ctx.strokeRect(this.x - 2, this.y, 4, this.n * this.dy + 2 * this.endSpace);

	// draw the paddle for the value
	var yy = this.y + this.endSpace + (this.getter() + 0.5) * this.dy;
	ctx.strokeStyle = '#222222';
	ctx.fillStyle = '#666666';
	ctx.fillRect(this.x - 10, yy - 0.5 * this.paddleHeight, 20, this.paddleHeight);
	ctx.strokeRect(this.x - 10, yy - 0.5 * this.paddleHeight, 20, this.paddleHeight);
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
		new Float32Array([0.0, 1.0, 0.0, 0.333, 0.0, 0.2]),
		new Float32Array([0.0, 0.0, 0.0, 0.0,   0.0, 0.0]));

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

// name, 4 intervals, 4 themes, rest
var presetData = [
    "Michael's Tune:    b7  b8  b5  off   off  b4 b23 off norm",
    "Muser's Waltz:    b10  b8  b7  off    on  c4  b1  b2 norm",
    "Scale:             c1  c2  c4  off   off off off off norm",
    "Ed's Rhythm Piece: b6  b6  b6   c2   off off  b1 b31 norm",
    "The Crazy Cuckoo:  c1  b1 b31   c8   off off  b1 b31 norm",
    "Birds 1:           b1  b2  b3   c4   b30 b31 b31 b31 norm",
    "Birds2:           b28 b29 b30  b30   b30 b31 b31 b31 norm",
    "Dorian Muse:       on  b1  b3   c8    b1 b16 off off norm",
    "Mesopotamia:       c2  b5  b9  off    c8  b9 b24  c4 norm",
    "Swiss Yodeler:     b8  c1 b16  off   b22 b21 b16 off norm",
    "Ron's Rhapsody:    B6  B9  b6 c1/2   b31  c4 off  c8 rest",
    "Christmas Bells:  b31 b30 b29  b28   b28 b29 b30 b31 norm",
    "Marvin's Yodel:    b2 b17  b9  b25   b16 off b15  c1 rest",
    "Federal Row:      b14  b5 b12   b2   b21 b24  c2 off norm",
    "Al's Surprise:     b1  b5  b7 c1/2    c8  b1  b7 b11 norm",
    "Meditiation:       b1 b31 b14  off   off off b16 b31 norm",
    "Flat Baroque:      c1 b15  b1 c1/2   b30 b29 b24 off rest",
    "Polka:             b1 b13 b11 c1/2    c8 b11  b7  b1 rest",
    "Rhyming Couplets:  b1  b2  c4   c8   off off b31  c4 norm",
    "Yodle:             c8  b2  b5   b6   off off  b1 b31 norm"];

// parse the presets and create the table of presets on the page
function parsePresets(muse, presetsTableId) {
    var table = document.querySelector('#' + presetsTableId);

    function getQuad(vals) {
	var quad = [];
	for (var j = 0; j < 4; j++) {
	    var name = vals[j].toUpperCase();
	    if ('C1/2' == name) {
		name = 'C 1/2';
	    }
	    quad.push(name);
	}
	return quad;
    }
    function createTD(txt, func) {
	var td = document.createElement('TD');
	var h = td;
	if (func) {
	    var a = document.createElement('A');
	    a.onclick = func;
	    td.appendChild(a);
	    h = a;
	}
	h.appendChild(document.createTextNode(txt));
	return td;
    }
    for (var i = 0; i < presetData.length; i++) {
	var name_vals = presetData[i].split(':');
	var name = name_vals[0];
	var vals = name_vals[1].trim().split(/\s+/);
	var tr = document.createElement('TR');
	var interval = getQuad(vals.splice(0, 4));
	var theme = getQuad(vals.splice(0, 4));
	var rest = vals[0].toUpperCase();

	function presetter(i, t, r) {
	    return function () {
		muse.state.preset(i, t, r);
	    }
	}
	tr.appendChild(createTD(name, presetter(interval, theme, rest)));
	tr.appendChild(createTD(interval.join(', ')));
	tr.appendChild(createTD(theme.join(', ')));
	tr.appendChild(createTD(rest));
	table.appendChild(tr);
    }
}    


// top level function called when page is loaded
function muse(canvasId, presetsTableId) {
    var muse = new Muse(canvasId);
    if (presetsTableId) {
	parsePresets(muse, presetsTableId);
    }
}
