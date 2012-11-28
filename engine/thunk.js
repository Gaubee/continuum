var thunk = (function(exports){
  "use strict";
  var objects   = require('../lib/objects'),
      Emitter   = require('../lib/Emitter');

  var define  = objects.define,
      inherit = objects.inherit;

  var operators    = require('./operators'),
      STRICT_EQUAL = operators.STRICT_EQUAL,
      ToObject     = operators.ToObject,
      UnaryOp      = operators.UnaryOp,
      BinaryOp     = operators.BinaryOp,
      GetValue     = operators.GetValue,
      PutValue     = operators.PutValue,
      PRE_INC      = operators.PRE_INC,
      POST_INC     = operators.POST_INC,
      PRE_DEC      = operators.PRE_DEC,
      POST_DEC     = operators.POST_DEC;

  var constants = require('./constants'),
      BINARYOPS = constants.BINARYOPS.array,
      UNARYOPS  = constants.UNARYOPS.array,
      ENTRY     = constants.ENTRY.hash,
      AST       = constants.AST.array,
      Pause     = constants.SYMBOLS.Pause,
      Empty     = constants.SYMBOLS.Empty,
      Resume    = constants.SYMBOLS.Resume,
      StopIteration = constants.BRANDS.StopIteration;

  var AbruptCompletion = require('./errors').AbruptCompletion;




  function Desc(v){
    this.Value = v;
  }

  Desc.prototype = {
    Configurable: true,
    Enumerable: true,
    Writable: true
  };



  var D = (function(d, i){
    while (i--) {
      d[i] = new Function('return function '+
        ((i & 1) ? 'E' : '_') +
        ((i & 2) ? 'C' : '_') +
        ((i & 4) ? 'W' : '_') +
        '(v){ this.Value = v }')();

      d[i].prototype = {
        Enumerable  : (i & 1) > 0,
        Configurable: (i & 2) > 0,
        Writable    : (i & 4) > 0
      };
    }
    return d;
  })([], 8);


  function DefineProperty(obj, key, val) {
    if (val && val.Completion) {
      if (val.Abrupt) {
        return val;
      } else {
        val = val.value;
      }
    }

    return obj.DefineOwnProperty(key, new Desc(val), false);
  }

  var log = false;



  function instructions(ops, opcodes){
    var out = [];
    for (var i=0; i < ops.length; i++) {
      out[i] = opcodes[+ops[i].op];
      if (out[i].name === 'LOG') {
        out.log = true;
      }
    }
    return out;
  }


  function Thunk(code){
    var opcodes = [AND, ARRAY, ARG, ARGS, ARRAY_DONE, BINARY, BLOCK, CALL, CASE,
      CLASS_DECL, CLASS_EXPR, COMPLETE, CONST, CONSTRUCT, DEBUGGER, DEFAULT, DEFINE,
      DUP, ELEMENT, ENUM, EXTENSIBLE, FLIP, FUNCTION, GET, INC, INDEX, ITERATE, JUMP,
      JEQ_NULL, JFALSE, JLT, JLTE, JGT, JGTE, JNEQ_NULL, JTRUE, LET,
      LITERAL, LOG, MEMBER, METHOD, NATIVE_CALL, NATIVE_REF, OBJECT, OR, POP,
      POPN, PROPERTY, PUT, REF, REFSYMBOL, REGEXP, RETURN, ROTATE, SAVE, SPREAD,
      SPREAD_ARG, SPREAD_ARRAY, STRING, SUPER_CALL, SUPER_ELEMENT, SUPER_MEMBER, SYMBOL, TEMPLATE,
      THIS, THROW, UNARY, UNDEFINED, UPDATE, UPSCOPE, VAR, WITH, YIELD];


    var thunk = this,
        ops = code.ops,
        cmds = instructions(ops, opcodes);

    function getKey(v){
      if (typeof v === 'string') {
        return v;
      }
      if (v[0] !== '@') {
        return v[1];
      }

      return context.getSymbol(v[1]);
    }

    function unwind(){
      for (var i = 0, entry; entry = code.transfers[i]; i++) {
        if (entry.begin < ip && ip <= entry.end) {
          if (entry.type === ENTRY.ENV) {
            trace(context.popBlock());
          } else {
            if (entry.type === ENTRY.TRYCATCH) {
              stack[sp++] = error.value;
              ip = entry.end;
              console.log(ops[ip])
              return cmds[ip];
            } else if (entry.type === ENTRY.FOROF) {
              if (error && error.value && error.value.BuiltinBrand === StopIteration) {
                ip = entry.end;
                return cmds[ip];
              }
            }
          }
        }
      }


      if (error) {
        if (error.value && error.value.setCode) {
          var range = code.ops[ip].range,
              loc = code.ops[ip].loc;

          if (!error.value.hasLocation) {
            error.value.hasLocation = true;
            error.value.setCode(loc, code.source);
            error.value.setOrigin(code.filename, code.displayName || code.name);
          }

          if (stacktrace) {
            if (error.value.trace) {
              [].push.apply(error.value.trace, stacktrace);
            } else {
              error.value.trace = stacktrace;
            }
            error.value.context || (error.value.context = context);
          }
        }
      }

      completion = error;
      return false;
    }



    function AND(){
      if (stack[sp - 1]) {
        sp--;
        return cmds[++ip];
      } else {
        ip = ops[ip][0];
        return cmds[ip];
      }
    }

    function ARGS(){
      stack[sp++] = [];
      return cmds[++ip];
    }

    function ARG(){
      var arg = stack[--sp];
      stack[sp - 1].push(arg);
      return cmds[++ip];
    }

    function ARRAY(){
      stack[sp++] = context.createArray(0);
      stack[sp++] = 0;
      return cmds[++ip];
    }

    function ARRAY_DONE(){
      var len = stack[--sp];
      stack[sp - 1].set('length', len);
      return cmds[++ip];
    }

    function BINARY(){
      var right  = stack[--sp],
          left   = stack[--sp],
          result = BinaryOp(BINARYOPS[ops[ip][0]], GetValue(left), GetValue(right));

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function BLOCK(){
      context.pushBlock(ops[ip][0]);
      return cmds[++ip];
    }

    function CALL(){
      var args     = stack[--sp],
          receiver = stack[--sp],
          func     = stack[--sp],
          result   = context.callFunction(func, receiver, args, ops[ip][0]);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function CASE(){
      var result = STRICT_EQUAL(stack[--sp], stack[sp - 1]);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      if (result) {
        sp--;
        ip = ops[ip][0];
        return cmds[ip];
      }

      return cmds[++ip];
    }

    function CLASS_DECL(){
      var def  = ops[ip][0],
          sup  = def.superClass ? stack[--sp] : undefined,
          ctor = context.createClass(def, sup);

      if (ctor && ctor.Completion) {
        if (ctor.Abrupt) {
          error = ctor;
          return unwind;
        } else {
          ctor = ctor.value;
        }
      }

      var result = context.initializeBinding(getKey(def.name), ctor);
      if (result && result.Abrupt) {
        error = result;
        return unwind;
      }

      return cmds[++ip];
    }

    function CLASS_EXPR(){
      var def  = ops[ip][0],
          sup  = def.superClass ? stack[--sp] : undefined,
          ctor = context.createClass(def, sup);

      if (ctor && ctor.Completion) {
        if (ctor.Abrupt) {
          error = ctor;
          return unwind;
        } else {
          ctor = ctor.value;
        }
      }

      stack[sp++] = ctor;
      return cmds[++ip];
    }

    function COMPLETE(){
      return false;
    }

    function CONST(){
      context.initializeBinding(code.lookup(ops[ip][0]), stack[--sp], true);
      return cmds[++ip];
    }

    function CONSTRUCT(){
      var args   = stack[--sp],
          func   = stack[--sp],
          result = context.constructFunction(func, args);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }
      stack[sp++] = result;
      return cmds[++ip];
    }

    function DEBUGGER(){
      cleanup = pauseCleanup;
      ip++;
      console.log(context, thunk);
      return false;
    }

    function DEFAULT(){
      sp--;
      ip = ops[ip][0];
      return cmds[++ip];
    }

    function DEFINE(){
      var attrs  = ops[ip][0],
          val    = stack[--sp],
          key    = stack[sp - 1],
          obj    = stack[sp - 2],
          result = obj.DefineOwnProperty(key, new D[attrs](val));

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function DUP(){
      stack[sp] = stack[sp++ - 1];
      return cmds[++ip];
    }

    function ELEMENT(){
      var obj    = stack[--sp],
          key    = stack[--sp],
          result = context.getPropertyReference(obj, key);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function ENUM(){
      stack[sp - 1] = stack[sp - 1].enumerator();
      return cmds[++ip];
    }

    function EXTENSIBLE(){
      stack[sp - 1].SetExtensible(!!ops[ip][0]);
      return cmds[++ip];
    }

    function FUNCTION(){
      stack[sp++] = context.createFunction(ops[ip][0], ops[ip][1]);
      return cmds[++ip];
    }

    function FLIP(){
      var buffer = [],
          index  = 0,
          count  = ops[ip][0];

      while (index < count) {
        buffer[index] = stack[sp - index++];
      }

      index = 0;
      while (index < count) {
        stack[sp - index] = buffer[count - ++index];
      }

      return cmds[++ip];
    }


    function GET(){
      var result = GetValue(stack[--sp]);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function INC(){
      stack[sp - 1]++;
      return cmds[++ip];
    }

    function INDEX(){
      var val   = stack[--sp],
          index = stack[--sp] + ops[ip][0],
          array = stack[sp - 1];

      array.DefineOwnProperty(index+'', new Desc(val));
      stack[sp++] = index + 1;

      return cmds[++ip];
    }

    function ITERATE(){
      stack[sp - 1] = stack[sp - 1].Iterate();
      return cmds[++ip];
    }

    function LITERAL(){
      stack[sp++] = ops[ip][0];
      return cmds[++ip];
    }

    function JUMP(){
      ip = ops[ip][0];
      return cmds[ip];
    }

    function JTRUE(){
      var cmp = stack[--sp];
      if (cmp) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JFALSE(){
      var cmp = stack[--sp];
      if (!cmp) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JEQ_NULL(){
      var cmp = stack[--sp];
      if (cmp === null) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JNEQ_NULL(){
      var cmp = stack[--sp];
      if (cmp !== null) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JLT(){
      var cmp = stack[--sp];
      if (cmp < ops[ip][1]) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JLTE(){
      var cmp = stack[--sp];
      if (cmp <= ops[ip][1]) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JGT(){
      var cmp = stack[--sp];
      if (cmp > ops[ip][1]) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function JGTE(){
      var cmp = stack[--sp];
      if (cmp >= ops[ip][1]) {
        ip = ops[ip][0];
        return cmds[ip];
      }
      return cmds[++ip];
    }

    function LET(){
      context.initializeBinding(code.lookup(ops[ip][0]), stack[--sp], true);
      return cmds[++ip];
    }

    function LOG(){
      context.Realm.emit('debug', [sp, stack]);
      return cmds[++ip];
    }

    function MEMBER(){
      var obj = stack[--sp],
          key = getKey(ops[ip][0]);

      if (key && key.Abrupt) {
        error = key;
        return unwind;
      }

      var result = context.getPropertyReference(key, obj);
      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function METHOD(){
      var kind = ops[ip][0],
          obj  = stack[sp - 1],
          code = ops[ip][1],
          key  = getKey(ops[ip][2]);

      if (key && key.Abrupt) {
        error = key;
        return unwind;
      }

      var status = context.defineMethod(kind, obj, key, code);

      if (status && status.Abrupt) {
        error = status;
        return unwind;
      }
      return cmds[++ip];
    }

    function NATIVE_CALL(){
      return CALL();
    }

    function NATIVE_REF(){
      if (!code.natives) {
        error = 'invalid native reference';
        return unwind;
      }
      stack[sp++] = context.Realm.natives.reference(code.lookup(ops[ip][0]), false);
      return cmds[++ip];
    }

    function PROPERTY(){
      var val    = stack[--sp],
          obj    = stack[sp - 1],
          key    = getKey(ops[ip][0]);

      if (key && key.Abrupt) {
        error = key;
        return unwind;
      }

      var status = DefineProperty(obj, key, val);
      if (status && status.Abrupt) {
        error = status;
        return unwind;
      }

      return cmds[++ip];
    }

    function OBJECT(){
      stack[sp++] = context.createObject();
      return cmds[++ip];
    }

    function OR(){
      if (stack[sp - 1]) {
        ip = ops[ip][0];
        return cmds[ip];
      } else {
        sp--;
        return cmds[++ip];
      }
    }

    function POP(){
      sp--;
      return cmds[++ip];
    }

    function POPN(){
      sp -= ops[ip][0];
      return cmds[++ip];
    }

    function PUT(){
      var val    = stack[--sp],
          ref    = stack[--sp],
          status = PutValue(ref, val);

      if (status && status.Abrupt) {
        error = status;
        return unwind;
      }

      stack[sp++] = val;
      return cmds[++ip];
    }

    function REGEXP(){
      stack[sp++] = context.createRegExp(ops[ip][0]);
      return cmds[++ip];
    }

    function REF(){
      var ident = code.lookup(ops[ip][0]);
      stack[sp++] = context.getReference(ident);
      return cmds[++ip];
    }


    function REFSYMBOL(){
      var symbol = code.lookup(ops[ip][0]);
      stack[sp++] = context.getSymbol(symbol);
      return cmds[++ip];
    }

    function RETURN(){
      completion = stack[--sp];
      ip++;
      if (code.generator) {
        context.currentGenerator.ExecutionContext = context;
        context.currentGenerator.State = 'closed';
        error = new AbruptCompletion('throw', context.Realm.intrinsics.StopIteration);
        unwind();
      }
      return false;
    }

    function ROTATE(){
      var buffer = [],
          item   = stack[--sp],
          index  = 0,
          count  = ops[ip][0];

      while (index < count) {
        buffer[index++] = stack[--sp];
      }

      buffer[index++] = item;

      while (index--) {
        stack[sp++] = buffer[index];
      }

      return cmds[++ip];
    }

    function SAVE(){
      completion = stack[--sp];
      return cmds[++ip];
    }

    function SPREAD(){
      var obj    = stack[--sp],
          index  = ops[ip][0],
          result = context.destructureSpread(obj, index);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function SPREAD_ARG(){
      var spread = stack[--sp],
          args   = stack[sp - 1],
          status = context.spreadArguments(args, spread);

      if (status && status.Abrupt) {
        error = status;
        return unwind;
      }

      return cmds[++ip];
    }

    function SPREAD_ARRAY(){
      var val = stack[--sp],
          index = stack[--sp] + ops[ip][0],
          array = stack[sp - 1],
          status = context.spreadArray(array, index, val);

      if (status && status.Abrupt) {
        error = status;
        return unwind;
      }

      stack[sp++] = status;
      return cmds[++ip];
    }


    function STRING(){
      stack[sp++] = code.lookup(ops[ip][0]);
      return cmds[++ip];
    }

    function SUPER_CALL(){
      var result = context.getSuperReference(false);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function SUPER_ELEMENT(){
      var result = context.getSuperReference(stack[--sp]);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function SUPER_MEMBER(){
      var key = getKey(ops[ip][0]);

      if (key && key.Abrupt) {
        error = key;
        return unwind;
      }
      var result = context.getSuperReference(key);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function SYMBOL(){
      var name = ops[ip][0],
          isPublic = ops[ip][1],
          hasInit = ops[ip][2];

      if (hasInit) {
        var init = stack[--sp];
        if (init && init.Completion) {
          if (init.Abrupt) { error = init; return unwind; } else init = init.value;
        }
      } else {
        var init = context.createSymbol(name, isPublic);
      }

      var result = context.initializeSymbolBinding(name, init);

      if (result && result.Abrupt) {
        error = result;
        return unwind;
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function TEMPLATE(){
      stack[sp++] = context.getTemplateCallSite(ops[ip][0]);
      return cmds[++ip];
    }

    function THIS(){
      var result = context.getThis();

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function THROW(){
      error = new AbruptCompletion('throw', stack[--sp]);
      return unwind;
    }

    function UNARY(){
      var result = UnaryOp(UNARYOPS[ops[ip][0]], stack[--sp]);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function UNDEFINED(){
      stack[sp++] = undefined;
      return cmds[++ip];
    }

    var updaters = [POST_DEC, PRE_DEC, POST_INC, PRE_INC];

    function UPDATE(){
      var update = updaters[ops[ip][0]],
          result = update(stack[--sp]);

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      stack[sp++] = result;
      return cmds[++ip];
    }

    function UPSCOPE(){
      context.popBlock();
      return cmds[++ip];
    }

    function VAR(){
      context.initializeBinding(code.lookup(ops[ip][0]), stack[--sp], false);
      return cmds[++ip];
    }

    function WITH(){
      var result = ToObject(GetValue(stack[--sp]));

      if (result && result.Completion) {
        if (result.Abrupt) {
          error = result;
          return unwind;
        } else {
          result = result.value;
        }
      }

      context.pushWith(result);
      return cmds[++ip];
    }

    function YIELD(){
      var generator = context.currentGenerator;
      generator.ExecutionContext = context;
      generator.State = 'suspended';
      context.pop();
      cleanup = yieldCleanup;
      yielded = stack[--sp];
      ip++;
      return false;
    }

    function trace(unwound){
      stacktrace || (stacktrace = []);
      stacktrace.push(unwound);
    }

    function normalPrepare(newContext){
      thunkStack.push({
        ip: ip,
        sp: sp,
        stack: stack,
        error: error,
        prepare: prepare,
        execute: execute,
        cleanup: cleanup,
        history: history,
        completion: completion,
        stacktrace: stacktrace,
        context: context,
        log: log,
        ctx: ctx,
        yielded: yielded
      });
      ip = 0;
      sp = 0;
      stack = [];
      error = completion = stacktrace = yielded = undefined;
      log = log || cmds.log;
      context = newContext;
      history = [];
      execute = context.Realm.quiet ? normalExecute : instrumentedExecute;
    }

    function normalCleanup(){
      var result = GetValue(completion);
      if (thunkStack.length) {
        var v = thunkStack.pop();
        ip = v.ip;
        sp = v.sp;
        stack = v.stack;
        error = v.error;
        prepare = v.prepare;
        execute = v.execute;
        cleanup = v.cleanup;
        history = v.history;
        completion = v.completion;
        stacktrace = v.stacktrace;
        context = v.context;
        log = v.log;
        ctx = v.ctx;
        yielded = v.yielded;
      }
      return result;
    }


    function normalExecute(){
      var f = cmds[ip],
          ips = 0;
      if (log) {
        history = [];
        while (f) {
          history[ips++] = [ip, ops[ip]];
          f = f();
        }
      } else {
        while (f) f = f();
      }
    }

    function instrumentedExecute(){
      var f = cmds[ip],
          ips = 0,
          realm = context.Realm;

      while (f) {
        history[ips++] = [ip, ops[ip]];
        realm.emit('op', [ops[ip], stack[sp - 1]]);
        f = f();
      }
    }

    function resumePrepare(){
      delete thunk.ip;
      delete thunk.stack;
      prepare = normalPrepare;
      context = ctx;
      ctx = undefined;
    }

    function pauseCleanup(){
      thunk.ip = ip;
      thunk.stack = stack;
      stack.length = sp;
      prepare = resumePrepare;
      cleanup = normalCleanup;
      ctx = context;
      return Pause;
    }

    function yieldPrepare(ctx){
      prepare = normalPrepare;
      context = ctx;
    }

    function yieldCleanup(){
      prepare = yieldPrepare;
      cleanup = normalCleanup;
      return yielded;
    }

    function run(ctx){
      prepare(ctx);
      execute();
      return cleanup();
    }

    function send(ctx, value){
      if (stack) {
        stack[sp++] = value;
      }
      return run(ctx);
    }


    var completion, yielded, stack, ip, sp, error, ctx, context, stacktrace, history;

    var executing = false, thunkStack = [];

    var prepare = normalPrepare,
        execute = normalExecute,
        cleanup = normalCleanup;

    this.run = run;
    this.send = send;
    this.code = code;
    Emitter.call(this);
  }

  inherit(Thunk, Emitter, []);

  exports.Thunk = Thunk;
  return exports;
})(typeof module !== 'undefined' ? module.exports : {});

