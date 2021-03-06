package graphene.instagram.model.graphserver;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.avro.AvroRemoteException;
import org.apache.tapestry5.ioc.annotations.Inject;
import org.apache.tapestry5.ioc.annotations.PostInjection;
import org.apache.tapestry5.ioc.annotations.Symbol;
import org.slf4j.Logger;

import graphene.dao.DocumentBuilder;
import graphene.dao.G_Parser;
import graphene.dao.GraphTraversalRuleService;
import graphene.dao.es.JestModule;
import graphene.model.idl.G_CanonicalPropertyType;
import graphene.model.idl.G_CanonicalRelationshipType;
import graphene.model.idl.G_DataAccess;
import graphene.model.idl.G_Entity;
import graphene.model.idl.G_EntityQuery;
import graphene.model.idl.G_PropertyType;
import graphene.model.idl.G_SearchResult;
import graphene.model.idlhelper.PropertyHelper;
import graphene.model.idlhelper.PropertyMatchDescriptorHelper;
import graphene.model.idlhelper.QueryHelper;
import graphene.model.idlhelper.SingletonRangeHelper;
import graphene.services.AbstractGraphBuilder;
import graphene.util.DataFormatConstants;
import graphene.util.StringUtils;
import graphene.util.validator.ValidationUtils;
import mil.darpa.vande.generic.V_GenericEdge;
import mil.darpa.vande.generic.V_GenericGraph;
import mil.darpa.vande.generic.V_GenericNode;
import mil.darpa.vande.generic.V_GraphQuery;
import mil.darpa.vande.generic.V_LegendItem;

/**
 * This version uses Elastic Search to dynamically generate a graph, without
 * using an in-memory database.
 * 
 * @author djue
 * 
 */
public class PropertyHyperGraphBuilderInstagramImpl extends AbstractGraphBuilder {

	public static final int MAX_RESULTS = 20;
	public static final double MIN_SCORE = 0.75d;
	private static final boolean CREATE_LINKS = true;
	private static final boolean MARK_START_NODE = true;
	private static final boolean TRIM_UNSHARED_NODES = false;
	protected HashMap<G_CanonicalPropertyType, String> colorMap = new HashMap<G_CanonicalPropertyType, String>();

	@Inject
	@Symbol(JestModule.ES_SEARCH_INDEX)
	private String index;

	@Inject
	private G_DataAccess combinedDAO;

	private ArrayList<String> listOfTypesToAlwaysKeep;

	@Inject
	private Logger logger;

	private final Map<String, Integer> traversalDepthMap = new HashMap<String, Integer>();

	@Inject
	private GraphTraversalRuleService ruleService;

	@Inject
	private DocumentBuilder db;

	public PropertyHyperGraphBuilderInstagramImpl() {
		setupTrimmingOptions();
		setupNodeInheritance();
	}

	@Override
	public V_GenericEdge createEdge(final V_GenericNode a, final String relationType, final String relationValue,
			final V_GenericNode attachTo, final double nodeCertainty, final double minimumScoreRequired,
			final Map<String, V_GenericEdge> edgeList) {
		V_GenericEdge edge = null;
		if (ValidationUtils.isValid(attachTo)) {
			final String key = generateEdgeId(attachTo.getId(), relationType, a.getId());
			if ((key != null) && !edgeList.containsKey(key)) {
				edge = new V_GenericEdge(key, a, attachTo);
				edge.setIdType(relationType);
				edge.setLabel(null);
				edge.setIdVal(relationType);
				if (nodeCertainty < 100.0) {
					edge.addData("Certainty", DataFormatConstants.formatPercent(nodeCertainty));
					edge.setLineStyle("dotted");
				}
				// if this is a LIKE edge
				if (relationType.equals(G_CanonicalRelationshipType.LIKES.name())) {
					edge.setColor("blue");
					edge.setLabel("+1");

					// if this is an OWNER_OF edge that is connected to
					// a "MEDIA" node...
				} else if (relationType.equals(G_CanonicalRelationshipType.OWNER_OF.name())
						&& (attachTo.getIdType().equals(G_CanonicalPropertyType.MEDIA.name()) || a.getIdType().equals(
								G_CanonicalPropertyType.MEDIA.name()))) {
					edge.setColor("green");
					edge.setCount(3);
				}
				edge.addData("Value", StringUtils.coalesc(" ", a.getLabel(), relationValue, attachTo.getLabel()));
				edgeList.put(key, edge);
			}
			// if this flag is set, we'll add the attributes to the
			// attached node.
			if (inheritAttributes) {
				attachTo.inheritPropertiesOfExcept(a, skipInheritanceTypes);
			}
		}
		return edge;
	}

	/**
	 * Creates one or more queries based on data within a specific node.
	 * 
	 * @param n
	 * @return
	 */
	@Override
	public List<G_EntityQuery> createQueriesFromNode(final V_GenericNode n) {
		final List<G_EntityQuery> list = new ArrayList<G_EntityQuery>(2);

		final PropertyMatchDescriptorHelper pmdh = new PropertyMatchDescriptorHelper();
		pmdh.setKey("_all");
		pmdh.setSingletonRange(new SingletonRangeHelper(n.getIdVal(), G_PropertyType.STRING));
		pmdh.setConstraint(ruleService.getRule(n.getIdType()));

		final QueryHelper qh = new QueryHelper(pmdh);
		// if (isUserExists()) {
		// qh.setUserId(getUser().getId());
		// qh.setUsername(getUser().getUsername());
		// }
		qh.setMinimumScore(1.0d);
		qh.setMaxResult((long) MAX_RESULTS);
		qh.setMinimumScore(n.getMinScore());
		qh.setInitiatorId(n.getId());
		list.add(qh);
		return list;
	}

	@Override
	public G_DataAccess getDAO() {
		return combinedDAO;
	}

	@Override
	public V_GenericGraph performPostProcess(final V_GraphQuery graphQuery, final V_GenericGraph vg) {
		logger.debug("Before post process, node list is size " + vg.getNodes().size());
		logger.debug("Before post process, edge list is size " + vg.getEdges().size());
		V_GenericNode startNode = null;
		// mandatory now. you'll see why down below
		// if (MARK_START_NODE) {
		for (final V_GenericNode n : vg.getNodes().values()) {
			for (final String queryId : graphQuery.getSearchIds()) {
				final String a = n.getLabel().toLowerCase().trim();
				final String c = n.getDataValue("text");
				final String b = queryId.toLowerCase().trim();
				if (org.apache.commons.lang3.StringUtils.containsIgnoreCase(a, b)
						|| org.apache.commons.lang3.StringUtils.containsIgnoreCase(b, a)) {
					n.setColor(style.getHighlightBackgroundColor());
					if ((startNode == null) && (n.getNodeType() == "REPORT_ID")) {
						startNode = n;
					}
				} else if ((c != null) && org.apache.commons.lang3.StringUtils.containsIgnoreCase(c, b)) {
					n.setColor(style.getHighlightBackgroundColor());
					if ((startNode == null) && (n.getNodeType() == "REPORT_ID")) {
						startNode = n;
					}
				}
				// n.addData("Label", a);

			}

		}
		// }
		if (TRIM_UNSHARED_NODES) {

			final Map<String, V_GenericNode> newNodeList = new HashMap<String, V_GenericNode>();
			final Map<String, Integer> countMap = new HashMap<String, Integer>();
			final Map<String, V_GenericEdge> newEdgeList = new HashMap<String, V_GenericEdge>();

			/*
			 * First we iterate over all the edges. Each time we see a node as
			 * either a source or target, we increment it's count.
			 */
			for (final V_GenericEdge e : vg.getEdges().values()) {
				final String s = e.getSourceId();
				final String t = e.getTargetId();
				final Integer sCount = countMap.get(s);
				if (sCount == null) {
					countMap.put(s, 1);
				} else {
					countMap.put(s, sCount + 1);
				}
				final Integer tCount = countMap.get(t);
				if (tCount == null) {
					countMap.put(t, 1);
				} else {
					countMap.put(t, tCount + 1);
				}
			}

			/**
			 * Next we loop over the edges again and look at the counts for each
			 * side.
			 * 
			 * If the count is one and we don't want to keep the node type,
			 * we'll skip adding it to the new list.
			 * 
			 */
			for (final V_GenericEdge e : vg.getEdges().values()) {
				boolean keepEdge = true;
				boolean keepTarget = true;
				boolean keepSource = true;
				final String sourceId = e.getSourceId();
				final String targetId = e.getTargetId();
				final V_GenericNode sourceNode = vg.getNodes().get(sourceId);
				final V_GenericNode targetNode = vg.getNodes().get(targetId);
				if (countMap.get(sourceId) == 1) {

					if (sourceNode != null) {
						// If the type is not something we always have to keep,
						// then mark the node and this edge to be pruned.
						if (!listOfTypesToAlwaysKeep.contains(sourceNode.getIdType())) {
							// aka ok to prune
							keepSource = false;
							keepEdge = false;
							targetNode.inheritPropertiesOfExcept(sourceNode, skipInheritanceTypes);
						}
					} else {
						logger.error("Node for source id " + sourceId + " was null");
					}
				}
				if (countMap.get(targetId) == 1) {
					final V_GenericNode n = vg.getNodes().get(targetId);
					if (n != null) {
						if (!listOfTypesToAlwaysKeep.contains(n.getIdType())) {
							keepTarget = false;
							keepEdge = false;
							sourceNode.inheritPropertiesOfExcept(targetNode, skipInheritanceTypes);

						}
					} else {
						logger.error("Node for target id " + targetId + " was null");
					}
				}
				if (keepEdge == true) {
					if (e.getIdVal().equals(G_CanonicalRelationshipType.CONTAINED_IN.name())) {
						e.setLineStyle("dotted");
						e.setWeight(50);
					}
					newEdgeList.put(e.getId(), e);
				}
				if (keepSource == true) {
					newNodeList.put(sourceId, vg.getNodes().get(sourceId));
				}
				if (keepTarget == true) {
					newNodeList.put(targetId, vg.getNodes().get(targetId));
				}
			}

			// TODO: remove legend items for node types that are no longer
			// present in graph
			final Collection<V_LegendItem> tempLegend = new ArrayList<V_LegendItem>();
			tempLegend.add(new V_LegendItem("#a90329", "Item you searched for."));
			tempLegend.add(new V_LegendItem("darkblue", "Selected item(s)."));
			tempLegend.addAll(vg.getLegend());
			vg.setLegend(tempLegend);
			vg.setNodes(newNodeList);
			vg.setEdges(newEdgeList);
			logger.debug("New node list is size " + vg.getNodes().size());
			logger.debug("New edge list is size " + vg.getEdges().size());
		}
		return vg;

	}

	@PostInjection
	public void setup() {

	}

	private void setupNodeInheritance() {
		skipInheritanceTypes = new ArrayList<String>();
		skipInheritanceTypes.add("ENTITY");
		// skipInheritanceTypes.add("IMAGE");
	}

	public void setupTrimmingOptions() {
		listOfTypesToAlwaysKeep = new ArrayList<String>();
		// listOfTypesToAlwaysKeep.add(G_CanonicalPropertyType.ACCOUNT.name());
		listOfTypesToAlwaysKeep.add(G_CanonicalPropertyType.CUSTOMER_NUMBER.name());
		listOfTypesToAlwaysKeep.add(G_CanonicalPropertyType.ENTITY.name());
		listOfTypesToAlwaysKeep.add(G_CanonicalPropertyType.REPORT_ID.name());
	}

	@Override
	public boolean execute(G_SearchResult sr, G_EntityQuery q) throws AvroRemoteException {
		// TODO Auto-generated method stub
		return false;
	}


}
