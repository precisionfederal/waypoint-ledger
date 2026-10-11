/* GET /fhir/StructureDefinition/{id}: see cf/functions/fhir/_serve.js. */
import { serveDefinition } from '../_serve.js';
export const onRequestGet = ({ params }) => serveDefinition('StructureDefinition', params.id);
