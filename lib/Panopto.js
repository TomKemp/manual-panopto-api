var _ = require('lodash');
var fs = require('fs');
var request = require('request');
var path = require('path');
var url = require('url');
var Handlebars = require('handlebars');
var parseString = require('xml2js').parseString;
var crypto = require('crypto');

var endPoints = require("./endpoints");

function generateAuthCode(userId, qualifiedName, key){
	var shasum = crypto.createHash('sha1');
	var string = userId + "@" + qualifiedName + "|" + key;
	shasum.update(string);
	return shasum.digest('hex');
}

var util = {
	generateAuthCode : generateAuthCode
}

module.exports = function(config){
	
	var PANOPTO_TEMPLATES = path.join(__dirname, "./PanoptoFunctions/");
	var SOAP_SUFFIX = "/Panopto/PublicAPISSL/4.6/";

	if(!config.soap_base){
		throw "Config must contain api base url";
	}

	var BASE_URL = url.parse(config.soap_base);

	if(BASE_URL.protocol === null){
		throw "URL must include protocol";
	}

	if(BASE_URL.protocol !== "https:"){
		throw "Must be https url";
	}

	var SOAP_URL = url.resolve(BASE_URL, SOAP_SUFFIX);


	function handleAllEndPoints(){
		var result = {};

		for(var i=0; i<endPoints.length; i++){
			var endPoint = endPoints[i];
			result[endPoint.name] = handleEndPoint(endPoint);
		}

		return result;

	}


	function handleEndPoint(endPoint){
		var results = {};
		for(var i=0; i<endPoint.functions.length; i++){
			var f = endPoint.functions[i];
			results[f.name] = handleFunction(endPoint,f);
		}
		return results;
	}

	function handleFunction(endPoint,f){

		var endPointName = endPoint.name;
		var functionName = f.name;

		var templatePath = PANOPTO_TEMPLATES+endPointName+"/"+ functionName + ".hbs";

		var data = fs.readFileSync(templatePath,{'encoding':'utf8'});

		if(!data){
			return null;
		}

		var template = Handlebars.compile(data);

	  return(function(params,cb){
	  	var BASE_NAMESPACE = "http://tempuri.org/";
		var result = template(params);
		var endPointURL = SOAP_URL+endPoint.name+".svc";
		var SOAPAction = BASE_NAMESPACE + endPoint.id + "/" + f.name;



		var options = {
		  url: endPointURL,
		  headers: {
		    'Content-Type': 'text/xml',
		    'SOAPAction':SOAPAction
		  },
		  body:result
		};

		function callback(error, response, body) {
			if(!error && response.statusCode === 200){
				var options = {
					ignoreAttrs:true,
					//Need explicit arrays so that things that are actually arrays are always arrays
					explicitArray:true,
					tagNameProcessors:[
						function(name){
							var index = name.indexOf(":");
							if(index<0){
								return name;
							}else{
								return name.substring(index+1);
							}
						}
					]
				}
				parseString(body, options, function (err, result) {
					if(err){
						cb(new Error("Could not parse xml"),null);
					}

					var extractBody = result.Envelope.Body;

					cb(null,extractBody);
				});
			}else{
				cb(new Error("Bad soap response"),null);
			}
		}

		request.post(options, callback);


		});
	}

	var result = {
		endpoints : handleAllEndPoints(),
		util : util
	}

	return result;

}




