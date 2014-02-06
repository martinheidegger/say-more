var exec = require("child_process").exec,
	spawn = require("child_process").spawn,
	async = require("async");

function getVolume(callback) {
	if (process.platform == 'darwin') {
		exec("osascript -e 'set ovol to output volume of (get volume settings)'", {}, function(error, data) {
			callback(parseFloat(data, 10));
		});
	} else {
		callback(0);
	}
}

function setVolume(volume, callback) {
	if (process.platform == 'darwin') {
		exec('osascript -e "set Volume '+volume/100 * 7+'"', function(error, data) {
			callback();
		});
	} else {
		callback();
	}
}

function speak(voice, rate, text, callback) {
	if (process.platform == 'darwin') {
    	var args = [];
    	if(voice) {
    		args.push("-v");
    		args.push(voice);
    	}
    	if(!isNaN(rate) && rate > 0) {
    		args.push("-r");
    		args.push(rate*200);
    	}
    	args.push(text);
    	var child = spawn("say", args);
    	child.on("close", function() {
    		callback();
    	});
	} else {
		callback();
	}
}

function changeVolumeTemporarily(volume, within, next) {
	getVolume(function(before) {
		if(before) {
			setVolume(before*volume, function() {
				within(function() {
					setVolume(before, next);
				});	
			});
		} else {
			within(next);
		}
	});
}

function sayPart(voice, volume, rate, text, callback) {
    if(!isNaN(volume) && volume != -1) {
    	changeVolumeTemporarily(volume, function(next) {
    		speak(voice, rate, text, next);
    	}, callback);
    } else {
    	speak(voice, rate, text, callback);
    }
}

function addLineRaw(line, stack, context) {
	stack.push(function(next) {
		sayPart(context.voice, context.volume, context.rate, line, next);
	});
}

function addLineWithPauses(line, stack, context) {
	lineWithPauses = line.split("...");
	for (var i = 0; i < lineWithPauses.length; i++) {
		if(i > 0) {
			stack.push(function(next) {
				var duration = 6000 / (context.rate * 200) * 20;
				setTimeout(next, duration);
			});
		}
		addLineRaw(lineWithPauses[i], stack, context);
	};
}

function addIntense(text, intensity, stack, context) {
	var beforeRate, beforeVolume;
	stack.push(function(next) {
		beforeRate = context.rate;
		beforeVolume = context.volume;
		context.rate *= 0.8;
		context.volume *= 1+intensity;
		next();
	});

	addLineWithPauses(text, stack, context);

	stack.push(function(next) {
		context.rate = beforeRate;
		context.volume = beforeVolume;
		next();
	});
}

function addRemark(text, intensity, stack, context) {
	var beforeRate, beforeVolume;
	stack.push(function(next) {
		beforeRate = context.rate;
		beforeVolume = context.volume;
		context.rate *= 0.8;
		context.volume *= 1-intensity;
		next();
	});

	addLineWithPauses(text, stack, context);

	stack.push(function(next) {
		context.rate = beforeRate;
		context.volume = beforeVolume;
		next();
	});
}

function addLineWithRemark(line, stack, context) {
	var lastIndex = 0,
		reg = /(\_+)([^\_]*)\_+/ig;
	while(remark = reg.exec(line)) {
		if(reg.lastIndex != lastIndex) {
			addLineWithIntense(line.substring(lastIndex, remark.index), stack, context);
		}
		addRemark(remark[2], Math.min(remark[1].length, 4)/4, stack, context);
		lastIndex = reg.lastIndex;
	}
	addLineWithIntense(line.substr(lastIndex), stack, context);
}

function addLineWithIntense(line, stack, context) {
	var lastIndex = 0,
		reg = /(\!+)([^\!]*)\!+/ig;
	while(intense = reg.exec(line)) {
		if(reg.lastIndex != lastIndex) {
			addLineWithPauses(line.substring(lastIndex, intense.index), stack, context);
		}
		addIntense(intense[2], Math.min(intense[1].length, 4)/4, stack, context);
		lastIndex = reg.lastIndex;
	}
	addLineWithPauses(line.substr(lastIndex), stack, context);
}

function addLine(line, stack, context) {
	if( name = /^\s*\[([^[]*)\](.*)/i.exec(line)) {
		var voice = name[1];
		line = name[2];
		stack.push(function(next) {
			context.voice = voice;
			next();
		});
	}
	addLineWithRemark(line, stack, context);
	
	return voice;
}

function sayMore(text, callback) {
	var voice = "",
		reg = /(.*)\n/ig,
		lastIndex, 
		stack = [], 
		context = {
			volume: 1.0,
			rate: 1.0,
			voice: ""
		};

	while(line = reg.exec(text)) {
		lastIndex = reg.lastIndex;
		addLine(line[1], stack, context);
	}
	addLine(text.substr(lastIndex), stack, context);
	async.series(stack, callback);
}

module.exports = sayMore;

//sayMore("[Kyoko] こんにちは\n[Otoya] Are you listening? !!!Hey, are you listening!!! Good. now you hear me\n皆様\n[Kyoko] ... __ファックユー__ ... ___really___ ... But now\n [Alex] for something completely different.");