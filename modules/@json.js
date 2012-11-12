export let JSON = {};

$__SetNativeBrand(JSON, 'NativeJSON');

let ReplacerFunction,
    PropertyList,
    stack,
    indent,
    gap;

function J(value){
  if (stack.has(value)) {
    throw $__Exception('circular_structure', []);
  }

  var stepback = indent,
      partial = [];

  indent += gap;
  stack.add(value);

  if ($__GetNativeBrand(value) === 'Array') {
    var brackets = ['[', ']'];

    for (var i=0, len = value.length; i < len; i++) {
      var prop = Str(i, value);
      partial[i] = prop === undefined ? 'null' : prop;
    }
  } else {
    var brackets = ['{', '}'],
        keys = PropertyList || $__Enumerate(value, false, true),
        colon = gap ? ': ' : ':';

    for (var i=0, len=keys.length; i < len; i++) {
      var prop = Str(keys[i], value);
      if (prop !== undefined) {
        partial.push($__Quote(keys[i]) + colon + prop);
      }
    }
  }

  if (!partial.length) {
    stack.delete(value);
    indent = stepback;
    return final = '';
  } else if (!gap) {
    stack.delete(value);
    indent = stepback;
    return final = partial.join(',');
  } else {
    var final = '\n' + indent + partial.join(',\n' + indent) + '\n' + stepback;
    stack.delete(value);
    indent = stepback;
    return final;
  }
}


function Str(key, holder){
  let value = holder[key];
  if ($__Type(value) === 'Object') {
    var toJSON = value.toJSON;
    if (typeof toJSON === 'function') {
      value = $__CallFunction(toJSON, value, [key]);
    }
  }

  var v = value;
  if (ReplacerFunction) {
    v = $__CallFunction(ReplacerFunction, holder, [key, v]);
  }

  if ($__Type(v) === 'Object') {
    var brand = $__GetNativeBrand(v);
    if (brand === 'Number') {
      v = $__ToNumber(v);
    } else if (brand === 'String') {
      v = $__ToString(v);
    } else if (brand === 'Boolean') {
      v = $__GetPrimitiveValue(v);
    }
  }


  if (v === null) {
    return 'null';
  } else if (v === true) {
    return 'true';
  } else if (v === false) {
    return 'false';
  } else {
    var type = typeof v;
    if (type === 'string') {
      return $__Quote(v);
    } else if (type === 'number') {
      return (v !== v || v === Infinity || v === -Infinity) ? 'null' : '' + v;
    } else if (type === 'object') {
      return J(v);
    }
  }

  throw value;
}


$__defineProps(JSON, {
  stringify(_value, replacer, space){
    ReplacerFunction = undefined;
    PropertyList = undefined;
    stack = new Set;
    indent = '';

    if ($__Type(replacer) === 'Object') {
      if (typeof replacer === 'function') {
        ReplacerFunction = replacer;
      } else if ($__GetNativeBrand(replacer) === 'Array') {
        let props = new Set;

        for (let v of replacer) {
          var item,
              type = $__Type(v);

          if (type === 'String') {
            item = v;
          } else if (type === 'Number') {
            item = v + '';
          } else if (type === 'Object') {
            let brand = $__GetNativeBrand(v);
            if (brand === 'String' || brand === 'Number') {
              item = $__ToString(v);
            }
          }

          if (item !== undefined) {
            props.add(item);
          }
        }

        PropertyList = [...props];
      }
    }

    if ($__Type(space) === 'Object') {
      space = $__GetPrimitiveValue(space);
    }

    if ($__Type(space) === 'String') {
      gap = $__StringSlice(space, 0, 10);
    } else if ($__Type(space) === 'Number') {
      space |= 0;
      space = space > 10 ? 10 : space < 1 ? 0 : space
      gap = ' '.repeat(space);
    } else {
      gap = '';
    }

    return Str('x', { 'x': _value });
  }
});