export function Function(...args){
  return $__FunctionCreate(args);
}

$__setupConstructor(Function, $__FunctionProto);
$__define(Function.prototype, 'name', '', 0);


export function apply(func, receiver, args){
  ensureFunction(func, '@function.apply');
  return $__Call(func, receiver, ensureArgs(args));
}

export function bind(func, receiver, ...args){
  ensureFunction(func, '@function.bind');
  return $__BoundFunctionCreate(func, receiver, args);
}

export function call(func, receiver, ...args){
  ensureFunction(func, '@function.call');
  return $__Call(func, receiver, args);
}

$__setupFunctions(apply, bind, call);


$__defineProps(Function.prototype, {
  apply(receiver, args){
    ensureFunction(this, 'Function.prototype.apply');
    return $__Call(this, receiver, ensureArgs(args));
  },
  bind(receiver, ...args){
    ensureFunction(this, 'Function.prototype.bind');
    return $__BoundFunctionCreate(this, receiver, args);
  },
  call(receiver, ...args){
    ensureFunction(this, 'Function.prototype.call');
    return $__Call(this, receiver, args);
  },
  toString(){
    ensureFunction(this, 'Function.prototype.toString');
    return $__FunctionToString(this);
  }
});


function ensureArgs(o, name){
  if (o == null || typeof o !== 'object' || typeof $__get(o, 'length') !== 'number') {
    throw $__Exception('apply_wrong_args', []);
  }

  var brand = $__GetBuiltinBrand(o);
  return brand === 'Array' || brand === 'Arguments' ? o : [...o];
}

function ensureFunction(o, name){
  if (typeof o !== 'function') {
    throw $__Exception('called_on_non_function', [name]);
  }
}
